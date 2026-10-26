import type { Guide, Session, Verdict } from "@apprentice/core";

/**
 * passed: verified on camera. unverified: confirmed by the trainee after the coach could not see
 * it. in_progress: the current step of a running session. failed: the session ended on this
 * step without a pass. not_reached: never started.
 */
export type StepStatus = "passed" | "unverified" | "in_progress" | "failed" | "not_reached";

export interface StepReport {
  index: number;
  title: string;
  status: StepStatus;
  /** The verdict that settled the step, if any. */
  final?: Verdict;
  /** Mistakes the coach caught on this step: wrong, skipped, not finished or unsafe. */
  caught: Verdict[];
  /** "Show me closer" requests on this step. */
  closerRequests: number;
}

export interface RunReport {
  sessionId: string;
  guideId: string;
  guideVersion: number;
  complete: boolean;
  passed: number;
  unverified: number;
  total: number;
  caught: number;
  durationS?: number;
  steps: StepReport[];
}

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
    complete: session.state === "complete",
    passed: steps.filter((s) => s.status === "passed").length,
    unverified: steps.filter((s) => s.status === "unverified").length,
    total: steps.length,
    caught: steps.reduce((n, s) => n + s.caught.length, 0),
    ...(durationS === undefined ? {} : { durationS }),
    steps,
  };
}
