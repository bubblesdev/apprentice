import type { Auditor, RunAudit, SafetyCall } from "@apprentice/core";

const STOP =
  /\b(mains|live wire|electric(al)? shock|unplug|gas|blade|saw|knife|cutter|boiling|hot surface|solder|pressur|chemical|acid|bleach)\w*/i;

/**
 * The credit-free stand-in for Muse Wonder. It is deterministic and conservative, and it labels
 * its output `source: "rules"`, so nothing it writes passes for a model's judgement.
 */
export class RulesAuditor implements Auditor {
  async reviewSafety(input: Parameters<Auditor["reviewSafety"]>[0]): Promise<SafetyCall[]> {
    return input.steps.map((s) => {
      const text = `${s.title} ${s.instruction} ${s.warning ?? ""}`;
      if (STOP.test(text))
        return { level: "stop", note: s.warning ?? "Make it safe before you start this step." };
      return s.warning ? { level: "caution", note: s.warning } : { level: "none" };
    });
  }

  async auditRun(input: Parameters<Auditor["auditRun"]>[0]): Promise<RunAudit> {
    const { report } = input;
    const concerns = report.steps.flatMap((s) => {
      if (s.status === "unverified")
        return [
          { stepIndex: s.index, note: "Confirmed by the trainee; the coach could not see it." },
        ];
      if (s.status === "failed")
        return [{ stepIndex: s.index, note: "The run ended before this step was verified." }];
      const unsafe = s.caught.find((v) => v.kind === "unsafe");
      return unsafe
        ? [{ stepIndex: s.index, note: `Stopped as unsafe: ${unsafe.evidence.sentence}` }]
        : [];
    });
    const suggestions = report.steps
      .filter((s) => s.caught.length + s.closerRequests >= 2)
      .map((s) => ({
        stepIndex: s.index,
        suggestion: `"${input.steps[s.index]?.title ?? `Step ${s.index + 1}`}" needed ${s.caught.length + s.closerRequests} extra checks; consider a clearer "done when" or a closer reference frame.`,
      }));
    return {
      summary: `Development mode, no model was called. ${report.passed} of ${report.total} steps were verified on camera and ${report.caught} mistakes were caught.`,
      concerns,
      suggestions,
      source: "rules",
    };
  }
}
