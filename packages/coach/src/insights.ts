import type { Guide, GuideInsights, Session, StepInsight } from "@apprentice/core";

export interface InsightOptions {
  /** Fewer runs than this never flag a step: one bad run is noise. */
  minRuns?: number;
  /** Share of runs needing more than a first-try pass that flags a step. */
  struggleRate?: number;
}

/**
 * Where trainees struggle, across every run of the guide's current version. A step is flagged
 * for its author when enough runs needed a retry, a closer look or a manual confirmation there.
 */
export function guideInsights(
  guide: Pick<Guide, "version" | "steps">,
  sessions: readonly Session[],
  opts: InsightOptions = {},
): GuideInsights {
  const minRuns = opts.minRuns ?? 3;
  const rate = opts.struggleRate ?? 0.4;
  const current = sessions.filter((s) => s.guideVersion === guide.version);
  const steps = guide.steps.map((_, index): StepInsight => {
    let runs = 0;
    let firstTry = 0;
    let caught = 0;
    let closerRequests = 0;
    let unverified = 0;
    for (const session of current) {
      const verdicts = session.verdicts.filter((v) => v.stepIndex === index);
      if (verdicts.length === 0 && session.stepIndex <= index) continue;
      runs++;
      const final = verdicts.find((v) => v.kind === "done");
      const extra = verdicts.filter((v) => v.kind !== "done");
      caught += extra.filter((v) => v.kind !== "unclear").length;
      closerRequests += extra.filter((v) => v.kind === "unclear").length;
      if (final?.decidedBy === "trainee") unverified++;
      if (final?.decidedBy === "policy" && extra.length === 0) firstTry++;
    }
    const struggled = runs - firstTry;
    return {
      index,
      runs,
      firstTry,
      caught,
      closerRequests,
      unverified,
      flagged: runs >= minRuns && struggled / runs >= rate,
    };
  });
  return {
    guideVersion: guide.version,
    runs: current.length,
    completed: current.filter(
      (s) =>
        s.state === "complete" &&
        s.verdicts.some((v) => v.stepIndex === guide.steps.length - 1 && v.kind === "done"),
    ).length,
    steps,
  };
}
