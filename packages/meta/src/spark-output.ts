import { SafetyLevel, VerdictKind, type StepDraft } from "@apprentice/core";
import { z } from "zod";

/** One step as Muse Spark writes it (snake_case, as in the spike-1 fixture). */
export const SparkStep = z.object({
  start_s: z.coerce.number().nonnegative(),
  end_s: z.coerce.number().nonnegative(),
  title: z.string().min(1),
  instruction: z.string().optional(),
  parts_and_tools: z.array(z.string()).default([]),
  visible_check: z.string().min(1),
  warning: z.string().optional(),
  safety: SafetyLevel.optional().catch(undefined),
});
export type SparkStep = z.infer<typeof SparkStep>;

export const SparkStepsOutput = z.object({ steps: z.array(SparkStep).min(1) });

/** Maps Spark's steps to drafts in time order, with the end never before the start. */
export function toStepDrafts(steps: SparkStep[]): StepDraft[] {
  return [...steps]
    .sort((a, b) => a.start_s - b.start_s)
    .map((s) => {
      const warning = s.warning?.trim();
      return {
        title: s.title.trim(),
        instruction: s.instruction?.trim() || s.title.trim(),
        startS: s.start_s,
        endS: Math.max(s.start_s, s.end_s),
        parts: s.parts_and_tools.map((p) => p.trim()).filter(Boolean),
        doneWhen: s.visible_check.trim(),
        ...(warning ? { warning } : {}),
        ...(s.safety ? { safety: s.safety } : {}),
      };
    });
}

export const SparkJudgement = z.object({
  verdict: VerdictKind,
  confidence: z.coerce.number().min(0).max(1),
  evidence: z.string().min(1),
});

export const SparkBoundary = z.object({
  end_s: z.coerce.number().nonnegative().nullable(),
  confidence: z.coerce.number().min(0).max(1),
  evidence: z.string().min(1),
});
