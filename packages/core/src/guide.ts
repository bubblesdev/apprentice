import { z } from "zod";

/** Where a guide's instructions came from. */
export const SourceKind = z.enum(["video", "video_url", "document"]);
export type SourceKind = z.infer<typeof SourceKind>;

export const Source = z.object({
  id: z.string().min(1),
  kind: SourceKind,
  title: z.string().min(1),
  /** Storage key (uploaded media) or URL (video_url). */
  location: z.string().min(1),
  durationS: z.number().nonnegative().optional(),
  /** Licence or ownership note shown with the guide, e.g. "CC BY 3.0, Wikimedia Commons". */
  attribution: z.string().optional(),
});
export type Source = z.infer<typeof Source>;

/** A box in source pixels, as SAM 3.1 returns it (x2/y2 inclusive). */
export const Box = z.object({
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
});
export type Box = z.infer<typeof Box>;

/** A part or tool a step depends on, with where it appears in the source. */
export const PartRef = z.object({
  name: z.string().min(1),
  /** Frame times (seconds) and boxes where the part is clearly visible. */
  sightings: z.array(z.object({ t: z.number().nonnegative(), box: Box })).default([]),
});
export type PartRef = z.infer<typeof PartRef>;

export const SafetyLevel = z.enum(["none", "caution", "stop"]);
export type SafetyLevel = z.infer<typeof SafetyLevel>;

export const Step = z
  .object({
    index: z.number().int().nonnegative(),
    title: z.string().min(1),
    instruction: z.string().min(1),
    startS: z.number().nonnegative(),
    endS: z.number().nonnegative(),
    parts: z.array(PartRef).default([]),
    /** What must be visible when the step is done correctly. */
    doneWhen: z.string().min(1),
    /** Frame times showing the finished state of this step. */
    referenceTimesS: z.array(z.number().nonnegative()).default([]),
    safety: z
      .object({ level: SafetyLevel, note: z.string().optional() })
      .default({ level: "none" }),
    diagramKey: z.string().optional(),
  })
  .refine((s) => s.endS >= s.startS, { message: "endS must not be before startS", path: ["endS"] });
export type Step = z.infer<typeof Step>;

export const GuideStatus = z.enum(["building", "draft", "approved"]);
export type GuideStatus = z.infer<typeof GuideStatus>;

export const Guide = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: GuideStatus,
  source: Source,
  steps: z.array(Step),
  /** Incremented whenever a pipeline stage rewrites the guide. */
  version: z.number().int().positive(),
});
export type Guide = z.infer<typeof Guide>;
