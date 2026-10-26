import {
  buildReport,
  startSession,
  transition,
  type CoachContext,
  type CoachEvent,
  type CoachPolicy,
  type Decision,
  type RunReport,
  type StepVerifier,
} from "@apprentice/coach";
import {
  BudgetExceededError,
  type Auditor,
  type ClientCoachEvent,
  type Clock,
  type CoachUpdate,
  type DecisionView,
  type Guide,
  type GuideRepository,
  type Media,
  type MediaStore,
  type RunAudit,
  type SessionRepository,
  type Step,
  type Transcriber,
  type VisionReasoner,
} from "@apprentice/core";

export class CoachError extends Error {
  constructor(
    readonly code: "not_found" | "not_ready" | "invalid_event" | "unheard",
    message: string,
  ) {
    super(message);
    this.name = "CoachError";
  }
}

/** Expert reference frames for a step, for the judge to compare against. */
export type ReferenceResolver = (guide: Guide, step: Step) => Promise<Media[]>;

export interface SessionAdapters {
  verifier: StepVerifier;
  reasoner: VisionReasoner;
  transcriber: Transcriber;
  auditor: Auditor;
}

export interface CoachServiceDeps {
  guides: GuideRepository;
  sessions: SessionRepository;
  media: MediaStore;
  /** Model adapters per session, so each session is metered and capped on its own. */
  adaptersFor: (sessionId: string) => Promise<SessionAdapters>;
  references: ReferenceResolver;
  policy: CoachPolicy;
  clock: Clock;
  newId: () => string;
}

export interface IncomingFrame {
  mime: string;
  data: Uint8Array;
}

function toView(decision: Decision | undefined): DecisionView | undefined {
  if (!decision) return undefined;
  switch (decision.kind) {
    case "pass":
      return { kind: "pass", sentence: decision.sentence };
    case "confirming":
      return {
        kind: "confirming",
        sentence: decision.sentence,
        agreeing: decision.agreeing,
        needed: decision.needed,
      };
    case "closer":
      return {
        kind: "closer",
        sentence: decision.sentence,
        reason: decision.reason,
        missingParts: decision.missingParts,
      };
    case "retry":
      return { kind: "retry", sentence: decision.sentence, reason: decision.verdict };
    case "not_yet":
    case "stop":
      return { kind: decision.kind, sentence: decision.sentence };
  }
}

/**
 * Runs live sessions on top of the pure coach machine: keeps each session's context, stores
 * live frames as evidence, asks the verifier for samples and persists every change. Work on one
 * session is serialized, so frames arriving while a sample is in flight queue behind it.
 */
export class CoachService {
  private readonly contexts = new Map<string, CoachContext>();
  private readonly guidesBySession = new Map<string, Guide>();
  private readonly queues = new Map<string, Promise<unknown>>();
  /** The latest live frame per session, so an answer can look at the trainee's work. */
  private readonly lastFrames = new Map<string, Media>();
  /** One audit per finished run; the run cannot change after it completes. */
  private readonly audits = new Map<string, Promise<RunAudit>>();
  private frameCounter = 0;

  constructor(private readonly deps: CoachServiceDeps) {}

  private update(ctx: CoachContext): CoachUpdate {
    const decision = toView(ctx.lastDecision);
    return {
      session: ctx.session,
      ...(decision ? { decision } : {}),
      canOverride:
        ctx.session.state === "closer" && ctx.closerStreak >= this.deps.policy.closerBeforeOverride,
      sampling: {
        framesPerSample: this.deps.policy.framesPerSample,
        sampleIntervalMs: this.deps.policy.sampleIntervalMs,
      },
    };
  }

  private serialize<T>(sessionId: string, work: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(sessionId) ?? Promise.resolve();
    const next = previous.then(work, work);
    this.queues.set(
      sessionId,
      next.catch(() => undefined),
    );
    return next;
  }

  private loaded(sessionId: string): { ctx: CoachContext; guide: Guide } {
    const ctx = this.contexts.get(sessionId);
    const guide = this.guidesBySession.get(sessionId);
    if (!ctx || !guide) throw new CoachError("not_found", `No live session ${sessionId}`);
    return { ctx, guide };
  }

  private async apply(
    sessionId: string,
    guide: Guide,
    ctx: CoachContext,
    event: CoachEvent,
  ): Promise<CoachUpdate> {
    const result = transition(ctx, event, {
      guide,
      policy: this.deps.policy,
      clock: this.deps.clock,
    });
    if (!result.ok) throw new CoachError("invalid_event", result.reason);
    this.contexts.set(sessionId, result.context);
    await this.deps.sessions.put(result.context.session);
    return this.update(result.context);
  }

  async start(guideId: string): Promise<CoachUpdate> {
    const guide = await this.deps.guides.get(guideId);
    if (!guide) throw new CoachError("not_found", `No guide ${guideId}`);
    if (guide.status === "building" || guide.steps.length === 0) {
      throw new CoachError("not_ready", "This guide is still being built");
    }
    const ctx = startSession({ id: this.deps.newId(), guide, clock: this.deps.clock });
    this.contexts.set(ctx.session.id, ctx);
    this.guidesBySession.set(ctx.session.id, guide);
    await this.deps.sessions.put(ctx.session);
    return this.update(ctx);
  }

  get(sessionId: string): CoachUpdate {
    return this.update(this.loaded(sessionId).ctx);
  }

  report(sessionId: string): RunReport {
    const { ctx, guide } = this.loaded(sessionId);
    return buildReport(guide, ctx.session);
  }

  dispatch(sessionId: string, event: ClientCoachEvent): Promise<CoachUpdate> {
    return this.serialize(sessionId, async () => {
      const { ctx, guide } = this.loaded(sessionId);
      return this.apply(sessionId, guide, ctx, event);
    });
  }

  /** One sample from a few live frames. Only accepted while verifying. */
  submitFrames(sessionId: string, frames: IncomingFrame[]): Promise<CoachUpdate> {
    return this.serialize(sessionId, async () => {
      const { ctx, guide } = this.loaded(sessionId);
      if (ctx.session.state !== "verifying") {
        throw new CoachError(
          "invalid_event",
          `Frames are only checked while verifying, not while ${ctx.session.state}`,
        );
      }
      const step = guide.steps[ctx.session.stepIndex];
      if (!step) throw new CoachError("not_found", "No current step");
      const live = await Promise.all(
        frames.map(async (frame) => {
          const key = `sessions/${sessionId}/frames/${String(++this.frameCounter).padStart(6, "0")}.jpg`;
          await this.deps.media.put(key, frame.data, frame.mime);
          const media: Media = { kind: "bytes", mime: frame.mime, data: frame.data };
          return { key, media };
        }),
      );
      const latest = live.at(-1);
      if (latest) this.lastFrames.set(sessionId, latest.media);
      const { verifier } = await this.deps.adaptersFor(sessionId);
      const sample = await verifier.sample({
        step,
        reference: await this.deps.references(guide, step),
        live,
      });
      return this.apply(sessionId, guide, ctx, { type: "sample", sample });
    });
  }

  private async hear(transcriber: Transcriber, audio: Media): Promise<string> {
    try {
      return (await transcriber.transcribe(audio)).text;
    } catch (error) {
      if (error instanceof BudgetExceededError)
        throw new CoachError(
          "unheard",
          "Voice questions are paused: this session's budget is used.",
        );
      throw new CoachError(
        "unheard",
        "I couldn't understand that recording. Try again, or type it.",
      );
    }
  }

  /** Answers a typed or spoken question about the current step. Does not change the coach state. */
  async ask(
    sessionId: string,
    question: { text: string } | { audio: Media },
  ): Promise<{ question: string; answer: string }> {
    const { ctx, guide } = this.loaded(sessionId);
    const step = guide.steps[ctx.session.stepIndex];
    if (!step) throw new CoachError("not_found", "No current step");
    const { reasoner, transcriber } = await this.deps.adaptersFor(sessionId);
    const text = "text" in question ? question.text : await this.hear(transcriber, question.audio);
    if (!text.trim())
      throw new CoachError("unheard", "I couldn't hear a question. Try again, or type it.");
    const frame = this.lastFrames.get(sessionId);
    const { answer } = await reasoner.answer({
      step: { title: step.title, instruction: step.instruction, doneWhen: step.doneWhen },
      question: text,
      live: frame ? [frame] : [],
    });
    return { question: text, answer };
  }

  /** Muse Wonder's review of a finished run (the rules fallback in fake mode). */
  audit(sessionId: string): Promise<RunAudit> {
    const { ctx, guide } = this.loaded(sessionId);
    if (ctx.session.state !== "complete")
      throw new CoachError("not_ready", "The run is still going");
    const existing = this.audits.get(sessionId);
    if (existing) return existing;
    const created = this.deps.adaptersFor(sessionId).then(({ auditor }) =>
      auditor.auditRun({
        title: guide.title,
        steps: guide.steps.map((s) => ({ title: s.title, doneWhen: s.doneWhen })),
        report: buildReport(guide, ctx.session),
      }),
    );
    created.catch(() => this.audits.delete(sessionId));
    this.audits.set(sessionId, created);
    return created;
  }
}
