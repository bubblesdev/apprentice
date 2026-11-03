import type { VerdictKind } from "@apprentice/core";
import { describe, expect, it } from "vitest";
import { decide } from "./decide.js";
import { CoachPolicy, DEFAULT_POLICY } from "./policy.js";
import { sample } from "./testing/builders.js";

const policy = DEFAULT_POLICY;

describe("decide: one sample of each verdict kind", () => {
  // [verdict, confidence, expected decision kind]
  const table: [VerdictKind, number, string][] = [
    ["done", 0.95, "confirming"],
    ["done", 0.8, "confirming"],
    ["done", 0.79, "closer"],
    ["wrong", 0.92, "retry"],
    ["wrong", 0.7, "retry"],
    ["wrong", 0.69, "closer"],
    ["skipped", 0.9, "retry"],
    ["skipped", 0.5, "closer"],
    ["not_yet", 0.9, "not_yet"],
    ["not_yet", 0.4, "closer"],
    ["unclear", 0.99, "closer"],
    ["unsafe", 0.75, "stop"],
    ["unsafe", 0.95, "stop"],
    ["unsafe", 0.74, "closer"],
  ];
  it.each(table)("%s at %d -> %s", (kind, confidence, expected) => {
    expect(decide([sample(kind, confidence)], policy).kind).toBe(expected);
  });
});

describe("decide: verify-then-advance", () => {
  it("passes only on two consecutive confident done samples", () => {
    const d = decide([sample("done", 0.9), sample("done", 0.85)], policy);
    expect(d).toMatchObject({ kind: "pass", confidence: 0.85 });
  });

  it("restarts the agreement count after any sample that does not qualify", () => {
    const samples = [sample("done", 0.9), sample("done", 0.5), sample("done", 0.9)];
    expect(decide(samples, policy)).toMatchObject({ kind: "confirming", agreeing: 1, needed: 2 });
    expect(decide([...samples, sample("done", 0.9)], policy).kind).toBe("pass");
  });

  it("never passes on a single sample with the default policy", () => {
    expect(decide([sample("done", 1)], policy).kind).toBe("confirming");
  });

  it("honours a tuned agreement count", () => {
    const one = CoachPolicy.parse({ agreeingSamples: 1 });
    const three = CoachPolicy.parse({ agreeingSamples: 3 });
    expect(decide([sample("done", 0.9)], one).kind).toBe("pass");
    expect(decide([sample("done", 0.9), sample("done", 0.9)], three).kind).toBe("confirming");
  });

  it("acts on the latest sample: a late mistake beats earlier passes", () => {
    const d = decide([sample("done", 0.9), sample("wrong", 0.9)], policy);
    expect(d).toMatchObject({ kind: "retry", verdict: "wrong" });
  });

  it("returns closer when there are no samples", () => {
    expect(decide([], policy)).toMatchObject({ kind: "closer", reason: "unclear" });
  });
});

describe("decide: required parts", () => {
  const cap = { name: "Power cap", present: true, confidence: 0.9 };
  const missingCap = { name: "Power cap", present: false };
  const faintCap = { name: "Power cap", present: true, confidence: 0.3 };

  it("asks for a closer look when a grounded part is not visible", () => {
    const d = decide(
      [sample("done", 0.9, { parts: [cap] }), sample("done", 0.9, { parts: [missingCap] })],
      policy,
    );
    expect(d).toEqual({
      kind: "closer",
      reason: "parts_missing",
      missingParts: ["Power cap"],
      sentence: "done at 0.9",
    });
  });

  it("treats a part below the presence threshold as missing", () => {
    const d = decide([sample("done", 0.9, { parts: [faintCap] })], policy);
    expect(d).toMatchObject({ kind: "closer", missingParts: ["Power cap"] });
  });

  it("does not let an earlier sample with a missing part count towards agreement", () => {
    const loose = CoachPolicy.parse({ requirePartsPresent: false });
    const strictRun = [
      sample("done", 0.9, { parts: [missingCap] }),
      sample("done", 0.9, { parts: [cap] }),
    ];
    expect(decide(strictRun, policy).kind).toBe("confirming");
    expect(decide(strictRun, loose).kind).toBe("pass");
  });
});

describe("decide: failures", () => {
  it("asks for a closer look after a model error, never passes", () => {
    const d = decide(
      [
        sample("done", 0.9),
        sample("done", 0.99, { error: { kind: "model", message: "bad json" } }),
      ],
      policy,
    );
    expect(d).toMatchObject({ kind: "closer", reason: "model_error" });
  });

  it("reports the coach as unavailable when the budget is spent", () => {
    const d = decide([sample("unclear", 0, { error: { kind: "budget", message: "cap" } })], policy);
    expect(d).toMatchObject({ kind: "closer", reason: "unavailable" });
  });
});
