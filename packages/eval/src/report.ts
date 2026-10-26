import type { CoachPolicy } from "@apprentice/coach";
import { projectedVerifyingCostPerMinute } from "./cost.js";
import type { LabelledRun } from "./labelled.js";
import { gateMetrics, scoreVerdicts, sweepPassConfidence } from "./metrics.js";

const pct = (v: number | null) => (v === null ? "n/a" : `${Math.round(v * 100)}%`);
const usd = (v: number) => `$${v.toFixed(4)}`;

function table(headers: string[], rows: string[][]): string {
  const line = (cells: string[]) => `| ${cells.join(" | ")} |`;
  return [line(headers), line(headers.map(() => "---")), ...rows.map(line)].join("\n");
}

/** A Markdown report for one labelled run under a given policy. */
export function runReport(run: LabelledRun, policy: CoachPolicy): string {
  const scores = scoreVerdicts(run.cases);
  const gate = gateMetrics(run.cases, policy);
  const kinds = scores.perKind.filter((k) => k.support > 0 || k.predicted > 0);
  const hasConfidence = run.cases.every((c) => c.predicted.confidence !== undefined);
  const parts = [
    `## ${run.name}`,
    run.description ?? "",
    `${scores.total} cases, exact-verdict accuracy ${pct(scores.accuracy)}.`,
    table(
      ["Verdict", "Labelled", "Predicted", "Precision", "Recall", "F1"],
      kinds.map((k) => [
        k.kind,
        String(k.support),
        String(k.predicted),
        pct(k.precision),
        pct(k.recall),
        pct(k.f1),
      ]),
    ),
    `**Coach gate** (pass confidence ${policy.passConfidence}): pass rate ${pct(gate.passRate)} ` +
      `(target 85%), catch rate ${pct(gate.catchRate)} (target 90%), ` +
      `${gate.falsePasses} false passes, ${gate.falseStops} false unsafe stops (target 0).`,
  ];
  if (hasConfidence) {
    const sweep = sweepPassConfidence(run.cases, [0.6, 0.7, 0.8, 0.9, 0.95], policy.stopConfidence);
    parts.push(
      table(
        ["Pass confidence", "Pass rate", "Catch rate", "False passes"],
        sweep.map((s) => [
          String(s.passConfidence),
          pct(s.metrics.passRate),
          pct(s.metrics.catchRate),
          String(s.metrics.falsePasses),
        ]),
      ),
    );
  } else {
    parts.push("_No confidences recorded for this run, so no threshold sweep._");
  }
  return parts.filter(Boolean).join("\n\n");
}

/** Cost section from recorded judge usage, projected at the policy's sampling rate. */
export function costReport(
  costPerJudgementUsd: number,
  calls: number,
  policy: CoachPolicy,
): string {
  const perMinute = projectedVerifyingCostPerMinute(costPerJudgementUsd, policy);
  return [
    "## Cost",
    `Muse Spark judge: ${usd(costPerJudgementUsd)} per call (mean of ${calls} recorded calls).`,
    `Verifying continuously at one sample every ${policy.sampleIntervalMs} ms would cost ` +
      `${usd(perMinute)} per minute (budget $0.05 per coaching minute). ` +
      "Checks should run only when the trainee says done, a few samples each.",
  ].join("\n\n");
}
