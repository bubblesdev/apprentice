import type { CoachPolicy } from "@apprentice/coach";
import { projectedVerifyingCostPerMinute } from "./cost.js";
import type { LabelledCase, LabelledRun } from "./labelled.js";
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
  const origins = [...new Set(run.cases.map((c) => c.origin ?? "unknown"))];
  if (origins.length > 1) {
    parts.push(
      table(
        ["Origin", "Cases", "Pass rate", "Catch rate", "False passes"],
        origins.map((o) => {
          const g = gateMetrics(
            run.cases.filter((c) => (c.origin ?? "unknown") === o),
            policy,
          );
          return [
            o,
            String(g.finished + g.unfinished),
            pct(g.passRate),
            pct(g.catchRate),
            String(g.falsePasses),
          ];
        }),
      ),
    );
  }
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

const advances = (c: LabelledCase, policy: Pick<CoachPolicy, "passConfidence">) =>
  c.predicted.kind === "done" && (c.predicted.confidence ?? 1) >= policy.passConfidence;

const signed = (v: number | null, w: number | null) =>
  v === null || w === null ? "n/a" : `${w - v >= 0 ? "+" : ""}${Math.round((w - v) * 100)} pts`;

/**
 * Before and after for a prompt, model or policy change on the same cases: gate metrics side by
 * side, then every case whose gate outcome changed (matched by case id).
 */
export function compareReport(
  before: LabelledRun,
  after: LabelledRun,
  policy: CoachPolicy,
): string {
  const a = gateMetrics(before.cases, policy);
  const b = gateMetrics(after.cases, policy);
  const byId = new Map(before.cases.map((c) => [c.id, c]));
  const shared = after.cases.filter((c) => byId.has(c.id));
  const changed = shared.flatMap((c) => {
    const old = byId.get(c.id);
    if (!old || advances(old, policy) === advances(c, policy)) return [];
    const better = advances(c, policy) === (c.label === "done");
    return [[c.id, c.label, old.predicted.kind, c.predicted.kind, better ? "better" : "worse"]];
  });
  return [
    before.name === after.name
      ? `## ${before.name}: before and after`
      : `## ${before.name} vs ${after.name}`,
    `${shared.length} shared cases (${before.cases.length} before, ${after.cases.length} after).`,
    table(
      ["Metric", "Before", "After", "Change"],
      [
        ["Pass rate", pct(a.passRate), pct(b.passRate), signed(a.passRate, b.passRate)],
        ["Catch rate", pct(a.catchRate), pct(b.catchRate), signed(a.catchRate, b.catchRate)],
        [
          "False passes",
          String(a.falsePasses),
          String(b.falsePasses),
          String(b.falsePasses - a.falsePasses),
        ],
        [
          "False stops",
          String(a.falseStops),
          String(b.falseStops),
          String(b.falseStops - a.falseStops),
        ],
      ],
    ),
    changed.length
      ? table(["Case", "Label", "Before", "After", "Gate"], changed)
      : "_No case changed its gate outcome._",
  ].join("\n\n");
}
