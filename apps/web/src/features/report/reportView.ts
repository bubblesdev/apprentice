import type { RunReport, StepReport, Verdict } from "@apprentice/core";
import { plural } from "../../lib/format";

export interface ReportSummary {
  headline: string;
  sentence: string;
  /** The first mistake the coach caught, to feature at the top of the report. */
  featured?: { step: StepReport; verdict: Verdict; fixed: boolean };
}

const CAUGHT_LABEL: Record<string, string> = {
  wrong: "Done wrong",
  skipped: "Skipped",
  not_yet: "Not finished",
  unsafe: "Unsafe",
};

export function caughtLabel(kind: Verdict["kind"]): string {
  return CAUGHT_LABEL[kind] ?? "Caught";
}

export function summarise(report: RunReport): ReportSummary {
  const { passed, unverified, total, caught, complete } = report;
  const allVerified = complete && passed === total;
  const headline = allVerified
    ? "Job done right"
    : complete
      ? `${passed} of ${total} steps verified`
      : "Run in progress";
  const parts = [
    allVerified
      ? "Every step verified on camera."
      : `${plural(passed, "step")} verified on camera.`,
    unverified ? `${plural(unverified, "step")} confirmed by you.` : "",
    caught
      ? `${plural(caught, "mistake")} caught${allVerified ? " and fixed" : ""}.`
      : "No mistakes caught.",
  ];
  const step = report.steps.find((s) => s.caught.length > 0);
  const verdict = step?.caught[0];
  return {
    headline,
    sentence: parts.filter(Boolean).join(" "),
    ...(step && verdict ? { featured: { step, verdict, fixed: step.status === "passed" } } : {}),
  };
}
