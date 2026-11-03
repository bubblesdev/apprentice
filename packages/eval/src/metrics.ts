import { VerdictKind } from "@apprentice/core";
import type { CoachPolicy } from "@apprentice/coach";
import type { LabelledCase } from "./labelled.js";

export interface KindScore {
  kind: VerdictKind;
  /** Cases labelled with this kind. */
  support: number;
  /** Cases predicted as this kind. */
  predicted: number;
  truePositives: number;
  /** null when undefined (nothing predicted, or nothing labelled). */
  precision: number | null;
  recall: number | null;
  f1: number | null;
}

export interface VerdictScores {
  total: number;
  accuracy: number;
  perKind: KindScore[];
  /** confusion[label][predicted] = count. */
  confusion: Record<VerdictKind, Record<VerdictKind, number>>;
}

const ratio = (n: number, d: number): number | null => (d === 0 ? null : n / d);

/** Exact-match precision and recall per verdict kind, with a confusion matrix. */
export function scoreVerdicts(cases: readonly LabelledCase[]): VerdictScores {
  const kinds = VerdictKind.options;
  const confusion = Object.fromEntries(
    kinds.map((l) => [l, Object.fromEntries(kinds.map((p) => [p, 0]))]),
  ) as Record<VerdictKind, Record<VerdictKind, number>>;
  for (const c of cases) confusion[c.label][c.predicted.kind]++;

  const perKind = kinds.map((kind): KindScore => {
    const support = cases.filter((c) => c.label === kind).length;
    const predicted = cases.filter((c) => c.predicted.kind === kind).length;
    const truePositives = confusion[kind][kind];
    const precision = ratio(truePositives, predicted);
    const recall = ratio(truePositives, support);
    const f1 =
      precision === null || recall === null || precision + recall === 0
        ? null
        : (2 * precision * recall) / (precision + recall);
    return { kind, support, predicted, truePositives, precision, recall, f1 };
  });
  const correct = cases.filter((c) => c.label === c.predicted.kind).length;
  return {
    total: cases.length,
    accuracy: cases.length ? correct / cases.length : 0,
    perKind,
    confusion,
  };
}

export interface GateMetrics {
  /** Steps that were really finished. */
  finished: number;
  /** Steps that were not finished (not started, skipped, wrong). */
  unfinished: number;
  /** Share of finished steps the coach would let through on this evidence. Target >= 0.85. */
  passRate: number | null;
  /** Share of unfinished steps the coach would hold back. Target >= 0.90. */
  catchRate: number | null;
  /** Unfinished steps the coach would wrongly pass: the costly mistake. */
  falsePasses: number;
  /** Confident "unsafe" stops on cases not labelled unsafe. Target 0 in the demo job. */
  falseStops: number;
}

/**
 * The coach's real question for each case: would this judgement let the trainee advance? A case
 * advances when the model says done at or above the pass confidence. Missing confidences count
 * as 1, so runs without them measure the verdict alone.
 */
export function gateMetrics(
  cases: readonly LabelledCase[],
  policy: Pick<CoachPolicy, "passConfidence" | "stopConfidence">,
): GateMetrics {
  const advances = (c: LabelledCase) =>
    c.predicted.kind === "done" && (c.predicted.confidence ?? 1) >= policy.passConfidence;
  const finished = cases.filter((c) => c.label === "done");
  const unfinished = cases.filter((c) => c.label !== "done");
  const falsePasses = unfinished.filter(advances).length;
  return {
    finished: finished.length,
    unfinished: unfinished.length,
    passRate: ratio(finished.filter(advances).length, finished.length),
    catchRate: ratio(unfinished.length - falsePasses, unfinished.length),
    falsePasses,
    falseStops: cases.filter(
      (c) =>
        c.label !== "unsafe" &&
        c.predicted.kind === "unsafe" &&
        (c.predicted.confidence ?? 1) >= policy.stopConfidence,
    ).length,
  };
}

/** Gate metrics across pass thresholds, to tune `CoachPolicy.passConfidence` from data. */
export function sweepPassConfidence(
  cases: readonly LabelledCase[],
  thresholds: readonly number[],
  stopConfidence: number,
): { passConfidence: number; metrics: GateMetrics }[] {
  return thresholds.map((passConfidence) => ({
    passConfidence,
    metrics: gateMetrics(cases, { passConfidence, stopConfidence }),
  }));
}
