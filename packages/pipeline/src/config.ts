import type { FrameExtractor, Segmenter, VisionReasoner } from "@apprentice/core";
import { z } from "zod";

/** Tunables for building a guide. They are part of each stage's input, so changing one re-runs only the stages it feeds. */
export const PipelineConfig = z.object({
  boundary: z
    .object({
      /** Seconds either side of a drafted step end to search for the finished state. */
      windowS: z.number().positive().default(8),
      /** Spacing of the dense frames inside the window. */
      frameStepS: z.number().positive().default(2),
      /** Below this confidence the drafted end is kept. */
      minConfidence: z.number().min(0).max(1).default(0.6),
    })
    .default({}),
  /** Where in a step its reference frames are taken, as fractions of the step; the end state matters most. */
  referenceFractions: z.array(z.number().min(0).max(1)).min(1).default([0.6, 0.85, 0.98]),
  grounding: z
    .object({
      /** How many of the latest reference frames each part is looked for in. */
      framesPerPart: z.number().int().min(1).default(2),
      presenceConfidence: z.number().min(0).max(1).default(0.5),
    })
    .default({}),
});
export type PipelineConfig = z.infer<typeof PipelineConfig>;

export interface PipelineDeps {
  reasoner: VisionReasoner;
  segmenter: Segmenter;
  frames: FrameExtractor;
}
