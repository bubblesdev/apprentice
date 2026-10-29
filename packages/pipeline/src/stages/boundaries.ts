import type { StepDraft } from "@apprentice/core";
import { z } from "zod";
import type { PipelineConfig, PipelineDeps } from "../config.js";
import { MediaRef, StepDraftSchema } from "../schemas.js";
import type { Stage } from "../stage.js";

export interface BoundaryInput {
  media: MediaRef;
  durationS: number;
  steps: StepDraft[];
  config: PipelineConfig["boundary"];
}

export const BoundaryNote = z.object({
  index: z.number().int().nonnegative(),
  draftEndS: z.number().nonnegative(),
  endS: z.number().nonnegative(),
  confidence: z.number().min(0).max(1),
  sentence: z.string(),
  changed: z.boolean(),
});
export type BoundaryNote = z.infer<typeof BoundaryNote>;

export const BoundaryOutput = z.object({
  steps: z.array(StepDraftSchema).min(1),
  notes: z.array(BoundaryNote),
});

const round = (t: number) => Math.round(t * 100) / 100;

/** Dense frame times around a drafted end, inside [lo, hi], always including the end clamped into the bounds. */
export function windowTimes(draftEndS: number, lo: number, hi: number, stepS: number): number[] {
  const times = new Set<number>([round(Math.min(Math.max(draftEndS, lo), hi))]);
  for (let t = draftEndS; t >= lo; t -= stepS) times.add(round(t));
  for (let t = draftEndS; t <= hi; t += stepS) times.add(round(t));
  return [...times].filter((t) => t >= lo && t <= hi).sort((a, b) => a - b);
}

/**
 * Spike 2 showed the drafted step ends were often too early, so "finished" frames still showed
 * the work in progress. For each step, Muse Spark looks at dense frames around the drafted end
 * and picks the first frame where the finished state is visible. A confident answer moves the
 * end (and the next step's start); otherwise the draft is kept. Steps never overlap or reorder.
 */
export const boundaryStage: Stage<BoundaryInput, typeof BoundaryOutput, PipelineDeps> = {
  name: "refine_boundaries",
  version: 1,
  output: BoundaryOutput,
  async run(input, deps) {
    const steps = input.steps.map((s) => ({ ...s }));
    const notes: BoundaryNote[] = [];
    const { windowS, frameStepS, minConfidence } = input.config;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (!step) continue;
      const next = steps[i + 1];
      const lo = Math.max(step.startS, step.endS - windowS);
      const hi = Math.min(next ? next.endS : input.durationS, step.endS + windowS, input.durationS);
      if (hi <= lo) continue;
      const times = windowTimes(step.endS, lo, hi, frameStepS);
      const frames = await Promise.all(
        times.map(async (t) => ({ t, media: await deps.frames.frameAt(input.media, t) })),
      );
      const brief = (s: StepDraft) => ({
        title: s.title,
        instruction: s.instruction,
        doneWhen: s.doneWhen,
      });
      const estimate = await deps.reasoner.refineBoundary({
        step: brief(step),
        ...(next ? { next: brief(next) } : {}),
        frames,
      });
      const accepted =
        estimate.endS !== null &&
        estimate.confidence >= minConfidence &&
        estimate.endS > step.startS &&
        estimate.endS <= hi;
      const endS = accepted && estimate.endS !== null ? estimate.endS : step.endS;
      notes.push({
        index: i,
        draftEndS: step.endS,
        endS,
        confidence: estimate.confidence,
        sentence: estimate.sentence,
        changed: endS !== step.endS,
      });
      step.endS = endS;
      if (next) next.startS = Math.min(endS, next.endS);
    }
    return { steps, notes };
  },
};
