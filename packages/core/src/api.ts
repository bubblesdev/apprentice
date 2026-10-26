import { z } from "zod";
import { SourceKind } from "./guide.js";
import { Session } from "./session.js";

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
