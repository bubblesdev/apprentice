import { GuideInsights, type Session, type Verdict } from "@apprentice/core";
import { describe, expect, it } from "vitest";
import { guideInsights } from "./insights.js";
import { smallGuide } from "./testing/builders.js";

const v = (
  stepIndex: number,
  kind: Verdict["kind"],
  decidedBy: Verdict["decidedBy"] = "policy",
): Verdict => ({
  stepIndex,
  kind,
  decidedBy,
  confidence: 0.9,
  evidence: { frameKeys: [], boxes: [], sentence: "x" },
  at: "2026-10-27T10:00:00.000Z",
});

const session = (id: string, verdicts: Verdict[], extra: Partial<Session> = {}): Session => ({
  id,
  guideId: "g1",
  guideVersion: 1,
  state: "complete",
  stepIndex: Math.max(0, ...verdicts.map((x) => x.stepIndex)),
  verdicts,
  startedAt: "2026-10-27T10:00:00.000Z",
  ...extra,
});

describe("guideInsights", () => {
  const clean = (id: string) => session(id, [v(0, "done"), v(1, "done"), v(2, "done")]);
  const struggling = (id: string) =>
    session(id, [v(0, "done"), v(1, "wrong"), v(1, "unclear"), v(1, "done"), v(2, "done")]);

  it("flags a step where enough runs struggled, and counts first-try passes", () => {
    const insights = guideInsights(smallGuide(), [
      clean("a"),
      struggling("b"),
      struggling("c"),
      struggling("d"),
    ]);
    expect(GuideInsights.parse(insights)).toEqual(insights);
    expect(insights).toMatchObject({ runs: 4, completed: 4 });
    expect(insights.steps[1]).toEqual({
      index: 1,
      runs: 4,
      firstTry: 1,
      caught: 3,
      closerRequests: 3,
      unverified: 0,
      flagged: true,
    });
    expect(insights.steps[0]?.flagged).toBe(false);
  });

  it("does not flag on too few runs, and ignores older guide versions", () => {
    expect(guideInsights(smallGuide(), [struggling("a"), struggling("b")]).steps[1]?.flagged).toBe(
      false,
    );
    const old = { ...struggling("c"), guideVersion: 0 };
    expect(guideInsights(smallGuide(), [old]).runs).toBe(0);
  });

  it("counts trainee confirmations and runs that never reached a step", () => {
    const partial = session("p", [v(0, "unclear"), v(0, "done", "trainee")], { state: "complete" });
    const insights = guideInsights(smallGuide(), [partial]);
    expect(insights.steps[0]).toMatchObject({ runs: 1, unverified: 1, firstTry: 0 });
    expect(insights.steps[2]?.runs).toBe(0);
    expect(insights.completed).toBe(0);
  });
});
