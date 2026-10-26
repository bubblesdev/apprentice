import { Box, VerdictKind } from "@apprentice/core";
import { z } from "zod";

/** Whether one grounded part of the step is visible in the trainee's latest frame. */
export const PartCheck = z.object({
  name: z.string().min(1),
  present: z.boolean(),
  confidence: z.number().min(0).max(1).optional(),
  box: Box.optional(),
});
export type PartCheck = z.infer<typeof PartCheck>;

/** Why a sample carries no usable judgement. */
export const SampleError = z.object({
  kind: z.enum(["model", "budget"]),
  message: z.string(),
});
export type SampleError = z.infer<typeof SampleError>;

/** One verification sample: the model's judgement of a few live frames plus part presence. */
export const Sample = z.object({
  judgement: z.object({
    kind: VerdictKind,
    confidence: z.number().min(0).max(1),
    sentence: z.string().min(1),
  }),
  parts: z.array(PartCheck).default([]),
  /** Storage keys of the live frames judged, kept as evidence. */
  frameKeys: z.array(z.string()).default([]),
  error: SampleError.optional(),
});
export type Sample = z.infer<typeof Sample>;
