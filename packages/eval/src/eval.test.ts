import type { UsageEvent } from "@apprentice/core";
import { CoachPolicy } from "@apprentice/coach";
import { loadJobFixture, type JobFixture } from "@apprentice/meta/fake";
import { beforeAll, describe, expect, it } from "vitest";
import { costPerCoachingMinute, costPerGuide, projectedVerifyingCostPerMinute } from "./cost.js";
import { LabelledRun, runsFromFixture, type LabelledCase } from "./labelled.js";
import { gateMetrics, scoreVerdicts, sweepPassConfidence } from "./metrics.js";
import { costReport, runReport } from "./report.js";

const policy = CoachPolicy.parse({});

function c(
  label: LabelledCase["label"],
  kind: LabelledCase["label"],
  confidence?: number,
): LabelledCase {
  return {
    id: `${label}-${kind}-${confidence}`,
    stepIndex: 0,
    label,
    predicted: { kind, ...(confidence === undefined ? {} : { confidence }) },
  };
}

describe("scoreVerdicts", () => {
  it("computes precision, recall and F1 per kind with a confusion matrix", () => {
    const cases = [
      c("done", "done"),
      c("done", "not_yet"),
      c("not_yet", "not_yet"),
      c("skipped", "not_yet"),
    ];
    const s = scoreVerdicts(cases);
    expect(s.accuracy).toBe(0.5);
    const notYet = s.perKind.find((k) => k.kind === "not_yet");
    expect(notYet).toMatchObject({ support: 1, predicted: 3, truePositives: 1, recall: 1 });
    expect(notYet?.precision).toBeCloseTo(1 / 3);
    expect(notYet?.f1).toBeCloseTo(0.5);
    expect(s.perKind.find((k) => k.kind === "skipped")).toMatchObject({
      recall: 0,
      precision: null,
      f1: null,
    });
    expect(s.confusion.skipped.not_yet).toBe(1);
  });

  it("handles an empty run", () => {
    expect(scoreVerdicts([]).accuracy).toBe(0);
  });
});

describe("gateMetrics", () => {
  it("counts false passes and false unsafe stops", () => {
    const cases = [
      c("done", "done", 0.9),
      c("done", "done", 0.7),
      c("not_yet", "done", 0.85),
      c("wrong", "wrong", 0.9),
      c("done", "unsafe", 0.9),
      c("unsafe", "unsafe", 0.9),
      c("not_yet", "unsafe", 0.5),
    ];
    expect(gateMetrics(cases, policy)).toEqual({
      finished: 3,
      unfinished: 4,
      passRate: 1 / 3,
      catchRate: 3 / 4,
      falsePasses: 1,
      falseStops: 1,
    });
  });

  it("sweeps pass thresholds", () => {
    const sweep = sweepPassConfidence(
      [c("done", "done", 0.85), c("not_yet", "done", 0.75)],
      [0.7, 0.8, 0.9],
      0.75,
    );
    expect(sweep.map((s) => [s.metrics.passRate, s.metrics.falsePasses])).toEqual([
      [1, 1],
      [1, 0],
      [0, 0],
    ]);
  });
});

describe("the recorded spike-2 runs", () => {
  let fixture: JobFixture;
  beforeAll(async () => {
    fixture = await loadJobFixture("ps1_buttons");
  });

  it("reproduces the spike-2 results: run A 9/21 exact, run B 10/16", () => {
    const [runA, runB] = runsFromFixture(fixture);
    if (!runA || !runB) throw new Error("expected two runs");
    expect(() => LabelledRun.parse(runA)).not.toThrow();
    expect(scoreVerdicts(runA.cases).accuracy).toBeCloseTo(9 / 21);
    const recall = Object.fromEntries(
      scoreVerdicts(runA.cases).perKind.map((k) => [k.kind, k.recall]),
    );
    expect(recall).toMatchObject({ done: 2 / 7, not_yet: 6 / 7, skipped: 1 / 7 });
    // Run B counted any "not done" verdict at the start of a step as a pass: that is the gate view.
    expect(gateMetrics(runB.cases, policy)).toMatchObject({
      passRate: 2 / 8,
      catchRate: 1,
      falsePasses: 0,
    });
  });

  it("measures run A at the coach gate across thresholds", () => {
    const [runA] = runsFromFixture(fixture);
    const sweep = sweepPassConfidence(runA?.cases ?? [], [0.8, 0.9], policy.stopConfidence);
    expect(sweep.map((s) => [s.metrics.passRate, s.metrics.falsePasses])).toEqual([
      [2 / 7, 3],
      [0, 2],
    ]);
  });

  it("renders a Markdown report", () => {
    const [runA, runB] = runsFromFixture(fixture);
    if (!runA || !runB) throw new Error("expected two runs");
    expect(runReport(runA, policy)).toMatch(/\| not_yet \| 7 \| 13 \|/);
    expect(runReport(runB, policy)).toMatch(/No confidences recorded/);
    expect(costReport(0.01, 21, policy)).toMatch(/\$0\.4000 per minute/);
  });
});

describe("cost", () => {
  const event = (kind: "guide" | "session", id: string, costUsd: number): UsageEvent => ({
    scope: { kind, id },
    operation: "judge_step",
    usage: { unit: "sam_images", images: 1 },
    costUsd,
    cached: false,
    at: "2026-10-27T10:00:00.000Z",
  });

  it("sums cost per guide", () => {
    const s = costPerGuide([
      event("guide", "a", 0.5),
      event("guide", "a", 0.25),
      event("guide", "b", 0.25),
      event("session", "s", 9),
    ]);
    expect(s).toEqual({ count: 2, totalUsd: 1, meanUsd: 0.5, maxUsd: 0.75 });
  });

  it("divides session cost by coaching minutes, skipping unknown lengths", () => {
    const s = costPerCoachingMinute([event("session", "s1", 0.2), event("session", "s2", 1)], {
      s1: 4,
    });
    expect(s).toEqual({ count: 1, totalUsd: 0.05, meanUsd: 0.05, maxUsd: 0.05 });
  });

  it("projects verifying cost from the sampling rate", () => {
    expect(projectedVerifyingCostPerMinute(0.01, { sampleIntervalMs: 1500 })).toBeCloseTo(0.4);
  });
});
