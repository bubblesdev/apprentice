import type {
  Clock,
  CoachState,
  Evidence,
  Guide,
  Session,
  Step,
  Verdict,
  VerdictKind,
} from "@apprentice/core";
import { decide, type Decision } from "./decide.js";
import type { CoachPolicy } from "./policy.js";
import type { Sample } from "./sample.js";

/** Everything the coach needs between events. Serializable, so a session can be resumed. */
export interface CoachContext {
  session: Session;
  /** Samples since the trainee last asked for a check. */
  samples: Sample[];
  /** "Show me closer" requests in a row on the current step. */
  closerStreak: number;
  /** The policy's latest conclusion, for the UI to explain. */
  lastDecision?: Decision;
}

export type CoachEvent =
  /** Acknowledge the briefing (and any safety warning) and start the step. */
  | { type: "begin" }
  /** The trainee says they are done, or the client starts verifying. */
  | { type: "check" }
  | { type: "sample"; sample: Sample }
  /** Move on after a pass. */
  | { type: "next" }
  /** Acknowledge an unsafe stop and redo the step. */
  | { type: "acknowledge" }
  /** The trainee confirms a step the coach could not see, after repeated closer requests. */
  | { type: "override" }
  | { type: "end" };

export type TransitionResult =
  { ok: true; context: CoachContext; verdict?: Verdict } | { ok: false; reason: string };

export interface MachineDeps {
  guide: Pick<Guide, "steps">;
  policy: CoachPolicy;
  clock: Clock;
}

const FROM: Record<CoachEvent["type"], readonly CoachState[]> = {
  begin: ["briefing"],
  check: ["doing", "closer", "retry"],
  sample: ["verifying"],
  next: ["passed"],
  acknowledge: ["blocked"],
  override: ["closer"],
  end: ["briefing", "doing", "verifying", "passed", "closer", "retry", "blocked"],
};

/** Steps that carry a "stop" safety level open with a briefing the trainee must acknowledge. */
function entryState(step: Step | undefined, isFirst: boolean): CoachState {
  return isFirst || step?.safety.level === "stop" ? "briefing" : "doing";
}

export function startSession(input: {
  id: string;
  guide: Pick<Guide, "id" | "version" | "steps">;
  clock: Clock;
}): CoachContext {
  if (input.guide.steps.length === 0) throw new Error("A guide needs at least one step to coach");
  return {
    session: {
      id: input.id,
      guideId: input.guide.id,
      guideVersion: input.guide.version,
      state: entryState(input.guide.steps[0], true),
      stepIndex: 0,
      verdicts: [],
      startedAt: input.clock.now().toISOString(),
    },
    samples: [],
    closerStreak: 0,
  };
}

function evidenceFrom(samples: readonly Sample[], sentence: string): Evidence {
  return {
    frameKeys: [...new Set(samples.flatMap((s) => s.frameKeys))],
    boxes: samples.flatMap((s) =>
      s.parts.flatMap((p) => (p.present && p.box ? [{ label: p.name, box: p.box }] : [])),
    ),
    sentence,
  };
}

function verdictFor(
  ctx: CoachContext,
  deps: MachineDeps,
  kind: VerdictKind,
  confidence: number,
  evidence: Evidence,
  decidedBy: Verdict["decidedBy"] = "policy",
): Verdict {
  return {
    stepIndex: ctx.session.stepIndex,
    kind,
    decidedBy,
    confidence,
    evidence,
    at: deps.clock.now().toISOString(),
  };
}

function withState(
  ctx: CoachContext,
  state: CoachState,
  patch: Partial<CoachContext> = {},
  verdict?: Verdict,
) {
  const session: Session = {
    ...ctx.session,
    state,
    verdicts: verdict ? [...ctx.session.verdicts, verdict] : ctx.session.verdicts,
  };
  return { ...ctx, ...patch, session };
}

function onSample(ctx: CoachContext, sample: Sample, deps: MachineDeps): TransitionResult {
  const samples = [...ctx.samples, sample];
  const decision = decide(samples, deps.policy);
  const latest = [sample];
  switch (decision.kind) {
    case "confirming":
      return { ok: true, context: { ...ctx, samples, lastDecision: decision } };
    case "pass": {
      const verdict = verdictFor(
        ctx,
        deps,
        "done",
        decision.confidence,
        evidenceFrom(decision.samples, decision.sentence),
      );
      return {
        ok: true,
        verdict,
        context: withState(
          ctx,
          "passed",
          { samples, closerStreak: 0, lastDecision: decision },
          verdict,
        ),
      };
    }
    case "closer": {
      const verdict = verdictFor(
        ctx,
        deps,
        "unclear",
        sample.judgement.confidence,
        evidenceFrom(latest, decision.sentence),
      );
      const streak =
        decision.reason === "unavailable" ? deps.policy.closerBeforeOverride : ctx.closerStreak + 1;
      return {
        ok: true,
        verdict,
        context: withState(
          ctx,
          "closer",
          { samples, closerStreak: streak, lastDecision: decision },
          verdict,
        ),
      };
    }
    case "retry": {
      const verdict = verdictFor(
        ctx,
        deps,
        decision.verdict,
        decision.confidence,
        evidenceFrom(latest, decision.sentence),
      );
      return {
        ok: true,
        verdict,
        context: withState(
          ctx,
          "retry",
          { samples, closerStreak: 0, lastDecision: decision },
          verdict,
        ),
      };
    }
    case "not_yet": {
      const verdict = verdictFor(
        ctx,
        deps,
        "not_yet",
        decision.confidence,
        evidenceFrom(latest, decision.sentence),
      );
      return {
        ok: true,
        verdict,
        context: withState(
          ctx,
          "doing",
          { samples, closerStreak: 0, lastDecision: decision },
          verdict,
        ),
      };
    }
    case "stop": {
      const verdict = verdictFor(
        ctx,
        deps,
        "unsafe",
        decision.confidence,
        evidenceFrom(latest, decision.sentence),
      );
      return {
        ok: true,
        verdict,
        context: withState(
          ctx,
          "blocked",
          { samples, closerStreak: 0, lastDecision: decision },
          verdict,
        ),
      };
    }
  }
}

function onNext(ctx: CoachContext, deps: MachineDeps): TransitionResult {
  const nextIndex = ctx.session.stepIndex + 1;
  const reset = { samples: [], closerStreak: 0 };
  if (nextIndex >= deps.guide.steps.length) {
    const session: Session = {
      ...ctx.session,
      state: "complete",
      endedAt: deps.clock.now().toISOString(),
    };
    return { ok: true, context: { session, ...reset } };
  }
  const session: Session = {
    ...ctx.session,
    stepIndex: nextIndex,
    state: entryState(deps.guide.steps[nextIndex], false),
  };
  return { ok: true, context: { session, ...reset } };
}

/**
 * The coach state machine (docs/ARCHITECTURE.md, "Coach state machine"). Pure: the same
 * context and event always give the same result, and an event that does not apply in the
 * current state is refused with a reason rather than ignored.
 */
export function transition(
  ctx: CoachContext,
  event: CoachEvent,
  deps: MachineDeps,
): TransitionResult {
  const state = ctx.session.state;
  if (!FROM[event.type].includes(state)) {
    return { ok: false, reason: `"${event.type}" is not allowed while ${state}` };
  }
  switch (event.type) {
    case "begin":
      return { ok: true, context: withState(ctx, "doing") };
    case "check":
      return { ok: true, context: withState(ctx, "verifying", { samples: [] }) };
    case "sample":
      return onSample(ctx, event.sample, deps);
    case "next":
      return onNext(ctx, deps);
    case "acknowledge":
      return { ok: true, context: withState(ctx, "doing", { samples: [] }) };
    case "override": {
      if (ctx.closerStreak < deps.policy.closerBeforeOverride) {
        return {
          ok: false,
          reason: "The coach has not asked for a closer look often enough to allow an override",
        };
      }
      const verdict = verdictFor(
        ctx,
        deps,
        "done",
        0,
        {
          frameKeys: [],
          boxes: [],
          sentence: "Confirmed by the trainee; the coach could not see it.",
        },
        "trainee",
      );
      return {
        ok: true,
        verdict,
        context: withState(ctx, "passed", { samples: [], closerStreak: 0 }, verdict),
      };
    }
    case "end": {
      const session: Session = {
        ...ctx.session,
        state: "complete",
        endedAt: deps.clock.now().toISOString(),
      };
      return { ok: true, context: { ...ctx, session, samples: [] } };
    }
  }
}
