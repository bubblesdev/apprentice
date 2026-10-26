import { VerdictKind } from "@apprentice/core";
import type { JobFixture } from "@apprentice/meta/fake";
import { z } from "zod";

/** One judged moment: what a person says the right verdict is, and what the model said. */
export const LabelledCase = z.object({
  id: z.string().min(1),
  /** 0-based step index. */
  stepIndex: z.number().int().nonnegative(),
  label: VerdictKind,
  predicted: z.object({
    kind: VerdictKind,
    /** Missing when the recording kept only the verdict (spike 2 run B). */
    confidence: z.number().min(0).max(1).optional(),
    sentence: z.string().optional(),
  }),
});
export type LabelledCase = z.infer<typeof LabelledCase>;

/** A file of labelled cases, e.g. James's eval recordings (correct run, skipped step, wrong part). */
export const LabelledRun = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  cases: z.array(LabelledCase).min(1),
});
export type LabelledRun = z.infer<typeof LabelledRun>;

/**
 * The two spike-2 runs as labelled runs. Run A's "correct" case used mid-step frames, so some of
 * its "done" labels are generous (spike/RESULTS.md); run B asks the live-coach question at the
 * start and end of each step but kept no confidences.
 */
export function runsFromFixture(fixture: JobFixture): LabelledRun[] {
  const runA: LabelledRun = {
    name: `${fixture.job} spike 2 run A`,
    description: "Three cases per step: correct (mid-step frames), skipped ahead, not started.",
    cases: fixture.judgements.map((j) => ({
      id: `A-${j.step}-${j.case}`,
      stepIndex: j.step - 1,
      label: j.expected,
      predicted: { kind: j.verdict, confidence: j.confidence, sentence: j.evidence },
    })),
  };
  const runB: LabelledRun = {
    name: `${fixture.job} spike 2 run B`,
    description: "Is the step finished? Frames from the end and the start of each step.",
    cases: fixture.finishChecks.map((c) => ({
      id: `B-${c.step}-${c.case}`,
      stepIndex: c.step - 1,
      label: c.case === "finished" ? "done" : "not_yet",
      predicted: { kind: c.verdict },
    })),
  };
  return [runA, runB];
}
