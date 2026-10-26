import { SafetyLevel, type Auditor } from "@apprentice/core";
import { z } from "zod";
import type { Stage } from "../stage.js";

export interface SafetyInput {
  title: string;
  steps: { title: string; instruction: string; warning?: string | undefined }[];
}

export const SafetyOutput = z.object({
  steps: z.array(z.object({ level: SafetyLevel, note: z.string().optional() })),
});

const RANK: Record<SafetyLevel, number> = { none: 0, caution: 1, stop: 2 };

/** Combines the draft's call with the review's: the more severe level always wins. */
export function mergeSafety(
  draft: { level: SafetyLevel; note?: string | undefined },
  review: { level: SafetyLevel; note?: string | undefined } | undefined,
): { level: SafetyLevel; note?: string } {
  const level = review && RANK[review.level] > RANK[draft.level] ? review.level : draft.level;
  const note = review?.note ?? draft.note;
  return level !== "none" && note ? { level, note } : { level };
}

/** Muse Wonder reads the whole guide and calls a safety level and note for every step. */
export const safetyStage: Stage<SafetyInput, typeof SafetyOutput, { auditor: Auditor }> = {
  name: "review_safety",
  version: 1,
  output: SafetyOutput,
  async run(input, deps) {
    return { steps: await deps.auditor.reviewSafety(input) };
  },
};
