import { z } from "zod";
import { SourceKind } from "./guide.js";
import { Session, Verdict } from "./session.js";

/**
 * The wire contract between apps/web and apps/api. Both sides parse with these schemas, so a
 * malformed message is rejected at the boundary instead of travelling into the domain.
 */

export const MediaRefBody = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("provider_file"),
    fileId: z.string().min(1),
    mime: z.string().optional(),
  }),
  z.object({ kind: z.literal("url"), url: z.string().url(), mime: z.string().optional() }),
]);

export const CreateGuideRequest = z.object({
  source: z.object({
    kind: SourceKind,
    title: z.string().min(1).max(200),
    location: z.string().min(1),
    durationS: z.number().positive().optional(),
    attribution: z.string().max(300).optional(),
  }),
  media: MediaRefBody,
  /** Local path or URL the worker can read frames from, when it differs from `media`. */
  frameSource: MediaRefBody.optional(),
  documentText: z.string().max(200_000).optional(),
});
export type CreateGuideRequest = z.infer<typeof CreateGuideRequest>;

export const CreateSessionRequest = z.object({ guideId: z.string().min(1) });

/** Coach events a client may send. Samples are produced by the server from frames. */
export const ClientCoachEvent = z.object({
  type: z.enum(["begin", "check", "next", "acknowledge", "override", "end"]),
});
export type ClientCoachEvent = z.infer<typeof ClientCoachEvent>;

/** One camera frame, base64 encoded, at most ~600 KB. */
export const FrameBody = z.object({
  mime: z.enum(["image/jpeg", "image/webp", "image/png"]),
  data: z.string().min(1).max(800_000),
});

export const FramesRequest = z.object({ frames: z.array(FrameBody).min(1).max(6) });

export const ClientMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("event"), event: ClientCoachEvent }),
  z.object({ type: z.literal("frames"), frames: FramesRequest.shape.frames }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

/** The policy's latest conclusion, shaped for the coach screen. */
export const DecisionView = z.object({
  kind: z.enum(["pass", "confirming", "closer", "retry", "not_yet", "stop"]),
  sentence: z.string(),
  reason: z.string().optional(),
  missingParts: z.array(z.string()).optional(),
  agreeing: z.number().int().optional(),
  needed: z.number().int().optional(),
});
export type DecisionView = z.infer<typeof DecisionView>;

export const CoachUpdate = z.object({
  session: Session,
  decision: DecisionView.optional(),
  /** The trainee may confirm the current step themselves (after repeated closer requests). */
  canOverride: z.boolean(),
  /** How the client should sample while verifying. */
  sampling: z.object({ framesPerSample: z.number().int(), sampleIntervalMs: z.number().int() }),
});
export type CoachUpdate = z.infer<typeof CoachUpdate>;

export const ServerMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("update"), update: CoachUpdate }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);
export type ServerMessage = z.infer<typeof ServerMessage>;

/**
 * passed: verified on camera. unverified: confirmed by the trainee after the coach could not see
 * it. in_progress: the current step of a running session. failed: the session ended on this
 * step without a pass. not_reached: never started.
 */
export const StepStatus = z.enum(["passed", "unverified", "in_progress", "failed", "not_reached"]);
export type StepStatus = z.infer<typeof StepStatus>;

export const StepReport = z.object({
  index: z.number().int().nonnegative(),
  title: z.string(),
  status: StepStatus,
  /** The verdict that settled the step, if any. */
  final: Verdict.optional(),
  /** Mistakes the coach caught on this step: wrong, skipped, not finished or unsafe. */
  caught: z.array(Verdict),
  /** "Show me closer" requests on this step. */
  closerRequests: z.number().int().nonnegative(),
});
export type StepReport = z.infer<typeof StepReport>;

export const RunReport = z.object({
  sessionId: z.string(),
  guideId: z.string(),
  guideVersion: z.number().int().positive(),
  complete: z.boolean(),
  passed: z.number().int().nonnegative(),
  unverified: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  caught: z.number().int().nonnegative(),
  durationS: z.number().nonnegative().optional(),
  startedAt: z.string().datetime(),
  steps: z.array(StepReport),
});
export type RunReport = z.infer<typeof RunReport>;

/** A trainee's question: typed, or spoken as 16-bit PCM WAV (about 60 s at 16 kHz fits). */
export const AskRequest = z
  .object({
    text: z.string().trim().min(1).max(500).optional(),
    audio: z
      .object({ mime: z.literal("audio/wav"), data: z.string().min(1).max(2_800_000) })
      .optional(),
  })
  .refine((r) => (r.text === undefined) !== (r.audio === undefined), {
    message: "Send either text or audio",
  });
export type AskRequest = z.infer<typeof AskRequest>;

export const AskResponse = z.object({ question: z.string(), answer: z.string() });
export type AskResponse = z.infer<typeof AskResponse>;

/** Muse Wonder's review of a finished run, shown on the report. */
export const RunAudit = z.object({
  summary: z.string(),
  /** Steps a supervisor should look at: weak passes, unverified steps, unsafe moments. */
  concerns: z.array(z.object({ stepIndex: z.number().int().nonnegative(), note: z.string() })),
  /** Wording changes that would help the next trainee, for the guide's author. */
  suggestions: z.array(
    z.object({ stepIndex: z.number().int().nonnegative(), suggestion: z.string() }),
  ),
  /** "model" when Muse Wonder wrote it, "rules" for the credit-free fallback. */
  source: z.enum(["model", "rules"]),
});
export type RunAudit = z.infer<typeof RunAudit>;

/** How trainees fared on each step across runs of one guide version. */
export const StepInsight = z.object({
  index: z.number().int().nonnegative(),
  /** Runs that reached this step. */
  runs: z.number().int().nonnegative(),
  /** Runs where the step passed on its first check, with no catch or closer request. */
  firstTry: z.number().int().nonnegative(),
  caught: z.number().int().nonnegative(),
  closerRequests: z.number().int().nonnegative(),
  unverified: z.number().int().nonnegative(),
  /** Enough runs struggled here that the author should look at the step. */
  flagged: z.boolean(),
});
export type StepInsight = z.infer<typeof StepInsight>;

export const GuideInsights = z.object({
  guideVersion: z.number().int().positive(),
  runs: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  steps: z.array(StepInsight),
});
export type GuideInsights = z.infer<typeof GuideInsights>;
