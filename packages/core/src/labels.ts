import { z } from "zod";

/** What really happened on a step in a trainee recording. */
export const StepOutcome = z.enum(["done", "wrong", "skipped"]);
export type StepOutcome = z.infer<typeof StepOutcome>;

/**
 * A person's labels for one trainee recording of a guide: when each step ended in the video and
 * how it went. Written by the labelling page, turned into eval cases by `@apprentice/eval`.
 */
export const RecordingLabels = z.object({
  version: z.literal(1),
  guideId: z.string().min(1),
  guideVersion: z.number().int().positive(),
  video: z.object({ name: z.string().min(1), durationS: z.number().positive() }),
  description: z.string().max(500).optional(),
  steps: z
    .array(
      z.object({
        stepIndex: z.number().int().nonnegative(),
        /** When the trainee finished the step, or moved on without doing it (skipped). */
        endS: z.number().nonnegative(),
        outcome: StepOutcome,
        note: z.string().max(300).optional(),
      }),
    )
    .min(1)
    .refine((steps) => new Set(steps.map((s) => s.stepIndex)).size === steps.length, {
      message: "Each step can be labelled once",
    }),
});
export type RecordingLabels = z.infer<typeof RecordingLabels>;
