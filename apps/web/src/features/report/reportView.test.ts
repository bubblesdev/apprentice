import type { RunReport, Verdict } from "@apprentice/core";
import { describe, expect, it } from "vitest";
import { summarise } from "./reportView";

const verdict = (kind: Verdict["kind"], stepIndex: number): Verdict => ({
  stepIndex,
  kind,
  decidedBy: "policy",
  confidence: 0.9,
  evidence: { frameKeys: [], boxes: [], sentence: "Thick blob of grease." },
  at: "2026-10-27T10:00:00.000Z",
});

function report(
  statuses: RunReport["steps"][number]["status"][],
  caughtOn?: number,
  complete = true,
): RunReport {
  const steps = statuses.map((status, index) => ({
    index,
    title: `Step ${index + 1}`,
    status,
    caught: index === caughtOn ? [verdict("wrong", index)] : [],
    closerRequests: 0,
  }));
  return {
    sessionId: "s",
    guideId: "g",
    guideVersion: 1,
    startedAt: "2026-10-27T10:00:00.000Z",
    complete,
    passed: statuses.filter((s) => s === "passed").length,
    unverified: statuses.filter((s) => s === "unverified").length,
    total: statuses.length,
    caught: caughtOn === undefined ? 0 : 1,
    steps,
  };
}

describe("summarise", () => {
  it("celebrates a fully verified run with a fixed mistake", () => {
    const s = summarise(report(["passed", "passed", "passed"], 1));
    expect(s.headline).toBe("Job done right");
    expect(s.sentence).toBe("Every step verified on camera. 1 mistake caught and fixed.");
    expect(s.featured).toMatchObject({ fixed: true, step: { index: 1 } });
  });

  it("is plain about partial and unverified runs", () => {
    const s = summarise(report(["passed", "unverified", "failed"]));
    expect(s.headline).toBe("1 of 3 steps verified");
    expect(s.sentence).toBe(
      "1 step verified on camera. 1 step confirmed by you. No mistakes caught.",
    );
    expect(s.featured).toBeUndefined();
  });

  it("marks a mid-run report as in progress", () => {
    expect(summarise(report(["passed", "in_progress"], undefined, false)).headline).toBe(
      "Run in progress",
    );
  });
});
