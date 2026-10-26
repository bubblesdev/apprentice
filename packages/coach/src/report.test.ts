import { describe, expect, it } from "vitest";
import {
  startSession,
  transition,
  type CoachContext,
  type CoachEvent,
  type MachineDeps,
} from "./machine.js";
import { CoachPolicy } from "./policy.js";
import { buildReport } from "./report.js";
import { sample, smallGuide, tickingClock } from "./testing/builders.js";

const deps: MachineDeps = {
  guide: smallGuide(),
  policy: CoachPolicy.parse({ agreeingSamples: 1, closerBeforeOverride: 1 }),
  clock: tickingClock(),
};

function run(events: CoachEvent[]): CoachContext {
  let ctx = startSession({ id: "sess1", guide: smallGuide(), clock: deps.clock });
  for (const event of events) {
    const result = transition(ctx, event, deps);
    if (!result.ok) throw new Error(result.reason);
    ctx = result.context;
  }
  return ctx;
}

const check = (kind: Parameters<typeof sample>[0], confidence = 0.9): CoachEvent[] => [
  { type: "check" },
  { type: "sample", sample: sample(kind, confidence) },
];

describe("buildReport", () => {
  it("reports a full run with a caught and fixed mistake", () => {
    const ctx = run([
      { type: "begin" },
      ...check("wrong"),
      ...check("done"),
      { type: "next" },
      { type: "begin" },
      ...check("unclear", 0.3),
      { type: "override" },
      { type: "next" },
      ...check("done"),
      { type: "next" },
    ]);
    const report = buildReport(smallGuide(), ctx.session);
    expect(report).toMatchObject({ complete: true, passed: 2, unverified: 1, total: 3, caught: 1 });
    expect(report.steps.map((s) => s.status)).toEqual(["passed", "unverified", "passed"]);
    expect(report.steps[0]?.caught.map((v) => v.kind)).toEqual(["wrong"]);
    expect(report.steps[1]?.closerRequests).toBe(1);
    expect(report.durationS).toBeGreaterThan(0);
  });

  it("marks the step a session ended on as failed and later ones as not reached", () => {
    const ctx = run([{ type: "begin" }, ...check("skipped"), { type: "end" }]);
    const report = buildReport(smallGuide(), ctx.session);
    expect(report.steps.map((s) => s.status)).toEqual(["failed", "not_reached", "not_reached"]);
    expect(report.caught).toBe(1);
  });

  it("shows the current step as in progress mid-run", () => {
    const report = buildReport(smallGuide(), run([{ type: "begin" }]).session);
    expect(report.complete).toBe(false);
    expect(report.steps[0]?.status).toBe("in_progress");
    expect(report.durationS).toBeUndefined();
  });
});
