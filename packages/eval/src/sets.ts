import { Guide, RecordingLabels, VerdictKind } from "@apprentice/core";
import { z } from "zod";

/** One moment to judge: which step, what the right verdict is, and which trainee frames show it. */
export const EvalCase = z.object({
  id: z.string().min(1),
  stepIndex: z.number().int().nonnegative(),
  label: VerdictKind,
  origin: z.enum(["synthetic", "recording"]),
  /** Times in the trainee video (the expert video itself for synthetic cases). */
  frameTimesS: z.array(z.number().nonnegative()).min(1).max(6),
  note: z.string().optional(),
});
export type EvalCase = z.infer<typeof EvalCase>;

/** Everything needed to run an eval without the API: the guide, both videos, the cases. */
export const EvalSet = z.object({
  name: z.string().min(1),
  createdAt: z.string().datetime(),
  guide: Guide,
  /** Local paths. Reference frames come from the expert video, live frames from the trainee video. */
  expertVideo: z.string().min(1),
  traineeVideo: z.string().min(1),
  attribution: z.string().optional(),
  cases: z.array(EvalCase).min(1),
});
export type EvalSet = z.infer<typeof EvalSet>;

const round = (t: number) => Math.round(t * 100) / 100;

/**
 * Labelled cases cut from the expert's own video, for any guide with times:
 * - done: two frames late in the step (92% and 96%), clear of the 98% reference frame;
 * - not_yet: two frames early in the step (5% and 15%);
 * - not_yet: the end of the step two before (clearly not started).
 * No skip cases: in the expert's video every earlier step really was done, so "skipped" cannot be
 * labelled honestly from it. Skips and wrong parts come from labelled trainee recordings.
 * These cases share the expert's camera and hands, so their scores are optimistic.
 */
export function syntheticCases(guide: Pick<Guide, "steps">): EvalCase[] {
  const cases: EvalCase[] = [];
  guide.steps.forEach((step, k) => {
    const len = step.endS - step.startS;
    if (len < 2) return;
    const at = (f: number) => round(step.startS + f * len);
    cases.push({
      id: `s${k + 1}-done`,
      stepIndex: k,
      label: "done",
      origin: "synthetic",
      frameTimesS: [at(0.92), at(0.96)],
    });
    cases.push({
      id: `s${k + 1}-start`,
      stepIndex: k,
      label: "not_yet",
      origin: "synthetic",
      frameTimesS: [at(0.05), at(0.15)],
    });
    const earlier = guide.steps[k - 2];
    if (earlier && earlier.endS - earlier.startS >= 2) {
      const e = (f: number) => round(earlier.startS + f * (earlier.endS - earlier.startS));
      cases.push({
        id: `s${k + 1}-earlier`,
        stepIndex: k,
        label: "not_yet",
        origin: "synthetic",
        frameTimesS: [e(0.6), e(0.9)],
      });
    }
  });
  return cases;
}

/**
 * Gold cases from a person's labels on a trainee recording. For each labelled step:
 * - done or wrong: the last two seconds before its end, labelled as the person saw it;
 * - skipped: the moment the trainee moved on, labelled skipped;
 * - and, unless skipped, a not_yet case early in the step (just after the previous labelled end).
 */
export function recordingCases(labels: RecordingLabels): EvalCase[] {
  const ordered = [...labels.steps].sort((a, b) => a.endS - b.endS);
  const cases: EvalCase[] = [];
  ordered.forEach((s, i) => {
    const prevEnd = ordered[i - 1]?.endS ?? 0;
    const n = s.stepIndex + 1;
    const tail = [round(Math.max(prevEnd, s.endS - 2)), round(s.endS)];
    const note = s.note ? { note: s.note } : {};
    if (s.outcome === "skipped") {
      cases.push({
        id: `r${n}-skipped`,
        stepIndex: s.stepIndex,
        label: "skipped",
        origin: "recording",
        frameTimesS: [round(s.endS)],
        ...note,
      });
      return;
    }
    cases.push({
      id: `r${n}-${s.outcome}`,
      stepIndex: s.stepIndex,
      label: s.outcome,
      origin: "recording",
      frameTimesS: [...new Set(tail)],
      ...note,
    });
    if (s.endS - prevEnd >= 6) {
      cases.push({
        id: `r${n}-start`,
        stepIndex: s.stepIndex,
        label: "not_yet",
        origin: "recording",
        frameTimesS: [round(prevEnd + 1.5)],
      });
    }
  });
  return cases;
}
