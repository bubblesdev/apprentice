import type { Guide, RunReport, Session, StepReport, StepStatus, Verdict } from "@apprentice/core";

export type { RunReport, StepReport, StepStatus } from "@apprentice/core";

const CAUGHT = new Set<Verdict["kind"]>(["wrong", "skipped", "not_yet", "unsafe"]);

function stepStatus(final: Verdict | undefined, index: number, session: Session): StepStatus {
  if (final) return final.decidedBy === "trainee" ? "unverified" : "passed";
  if (index !== session.stepIndex) return "not_reached";
  return session.state === "complete" ? "failed" : "in_progress";
}

/** The evidence report at the end of a run: every step passed or failed, with its frames. */
export function buildReport(guide: Pick<Guide, "steps">, session: Session): RunReport {
  const steps = guide.steps.map((step, index): StepReport => {
    const verdicts = session.verdicts.filter((v) => v.stepIndex === index);
    const final = verdicts.find((v) => v.kind === "done");
    return {
      index,
      title: step.title,
      status: stepStatus(final, index, session),
      ...(final ? { final } : {}),
      caught: verdicts.filter((v) => CAUGHT.has(v.kind)),
      closerRequests: verdicts.filter((v) => v.kind === "unclear").length,
    };
  });
  const durationS = session.endedAt
    ? (Date.parse(session.endedAt) - Date.parse(session.startedAt)) / 1000
    : undefined;
  return {
    sessionId: session.id,
    guideId: session.guideId,
    guideVersion: session.guideVersion,
    startedAt: session.startedAt,
    complete: session.state === "complete",
    passed: steps.filter((s) => s.status === "passed").length,
    unverified: steps.filter((s) => s.status === "unverified").length,
    total: steps.length,
    caught: steps.reduce((n, s) => n + s.caught.length, 0),
    ...(durationS === undefined ? {} : { durationS }),
    steps,
  };
}
