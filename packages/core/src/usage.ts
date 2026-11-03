import { z } from "zod";

/** What a metered model call was for, so cost can be reported per guide and per coaching minute. */
export const UsageScope = z.object({
  kind: z.enum(["guide", "session", "eval"]),
  id: z.string().min(1),
});
export type UsageScope = z.infer<typeof UsageScope>;

/**
 * Billable units of one call. Token models bill by tokens, SAM 3.1 by image or video frame,
 * Muse Image by image, Voice Transcribe by second of audio.
 */
export const Usage = z.discriminatedUnion("unit", [
  z.object({
    unit: z.literal("tokens"),
    model: z.string().min(1),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
  }),
  z.object({ unit: z.literal("sam_images"), images: z.number().int().nonnegative() }),
  z.object({
    unit: z.literal("sam_video_frames"),
    frames: z.number().int().nonnegative(),
    /** True when the frame count was inferred from the output rather than known up front. */
    estimated: z.boolean().default(false),
  }),
  z.object({
    unit: z.literal("images"),
    model: z.string().min(1),
    images: z.number().int().nonnegative(),
  }),
  z.object({ unit: z.literal("audio_seconds"), seconds: z.number().nonnegative() }),
]);
export type Usage = z.infer<typeof Usage>;

/** One metered call. Cache hits are recorded with `cached: true` and zero cost. */
export const UsageEvent = z.object({
  scope: UsageScope,
  operation: z.string().min(1),
  usage: Usage,
  costUsd: z.number().nonnegative(),
  cached: z.boolean(),
  at: z.string().datetime(),
});
export type UsageEvent = z.infer<typeof UsageEvent>;
