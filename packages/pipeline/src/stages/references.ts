import { z } from "zod";
import type { Stage } from "../stage.js";

export interface ReferenceInput {
  steps: { startS: number; endS: number }[];
  fractions: number[];
}

export const ReferenceOutput = z.object({
  referenceTimesS: z.array(z.array(z.number().nonnegative())),
});

/** Reference frame times for one step: late in the step, where the finished state shows. */
export function referenceTimes(startS: number, endS: number, fractions: number[]): number[] {
  if (endS <= startS) return [];
  const times = fractions.map((f) => Math.round((startS + f * (endS - startS)) * 100) / 100);
  return [...new Set(times)].sort((a, b) => a - b);
}

/** Chooses the expert frames each live check is compared against. No model calls. */
export const referenceStage: Stage<ReferenceInput, typeof ReferenceOutput, unknown> = {
  name: "reference_frames",
  version: 1,
  output: ReferenceOutput,
  async run(input) {
    return {
      referenceTimesS: input.steps.map((s) => referenceTimes(s.startS, s.endS, input.fractions)),
    };
  },
};
