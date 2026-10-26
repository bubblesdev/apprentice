import { z } from "zod";

/**
 * Every threshold the coach uses, in one place, so `packages/eval` can tune them from labelled
 * runs. Defaults lean towards asking for a closer look rather than passing a step wrongly.
 */
export const CoachPolicy = z.object({
  /** A "done" sample counts towards a pass only at or above this confidence. */
  passConfidence: z.number().min(0).max(1).default(0.8),
  /** Consecutive qualifying "done" samples needed to advance. */
  agreeingSamples: z.number().int().min(1).default(2),
  /** wrong, skipped or not_yet at or above this confidence are acted on; below, ask for a closer look. */
  retryConfidence: z.number().min(0).max(1).default(0.7),
  /** unsafe at or above this confidence stops the trainee; below, ask for a closer look. */
  stopConfidence: z.number().min(0).max(1).default(0.75),
  /** Every part SAM grounded in the expert's frames must be visible before a pass. */
  requirePartsPresent: z.boolean().default(true),
  /** Minimum SAM 3.1 detection confidence for a part to count as present. */
  presenceConfidence: z.number().min(0).max(1).default(0.5),
  /** After this many "show me closer" requests in a row the trainee may confirm the step themselves. */
  closerBeforeOverride: z.number().int().min(1).default(3),
  /** Live frames sent per sample, and how often the client samples while verifying. */
  framesPerSample: z.number().int().min(1).max(6).default(2),
  sampleIntervalMs: z.number().int().min(250).default(1500),
});
export type CoachPolicy = z.infer<typeof CoachPolicy>;

export const DEFAULT_POLICY: CoachPolicy = CoachPolicy.parse({});
