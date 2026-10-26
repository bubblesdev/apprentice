import type { RunReport } from "@apprentice/core";
import { describe, expect, it } from "vitest";
import { RulesAuditor } from "./fake/rules-auditor.js";
import { CostMeter } from "./meter.js";
import { StubMetaApi } from "./testing/stub-api.js";
import { WonderAuditor } from "./wonder.js";

const steps = [
  { title: "Unplug the iron", instruction: "Unplug it and let it cool.", warning: "Hot plate" },
  { title: "Open the case", instruction: "Remove four screws.", warning: "Sharp edges" },
  { title: "Wipe the plate", instruction: "Wipe with a damp cloth." },
];

const verdict = (kind: "wrong" | "unsafe" | "done", stepIndex: number) => ({
  stepIndex,
  kind,
  decidedBy: "policy" as const,
  confidence: 0.9,
  evidence: { frameKeys: [], boxes: [], sentence: `${kind} evidence` },
  at: "2026-10-27T10:00:00.000Z",
});

const report: RunReport = {
  sessionId: "s",
  guideId: "g",
  guideVersion: 1,
  startedAt: "2026-10-27T10:00:00.000Z",
  complete: true,
  passed: 1,
  unverified: 1,
  total: 3,
  caught: 3,
  steps: [
    {
      index: 0,
      title: "Unplug the iron",
      status: "passed",
      caught: [verdict("unsafe", 0)],
      closerRequests: 0,
    },
    {
      index: 1,
      title: "Open the case",
      status: "unverified",
      caught: [verdict("wrong", 1), verdict("wrong", 1)],
      closerRequests: 3,
    },
    { index: 2, title: "Wipe the plate", status: "failed", caught: [], closerRequests: 0 },
  ],
};

describe("WonderAuditor", () => {
  it("reviews safety step by step on Muse Wonder and meters its tokens", async () => {
    const api = new StubMetaApi([
      {
        text: '{"steps":[{"level":"stop","note":" Unplug and let it cool. "},{"level":"caution","note":"Mind the edges."},{"level":"none","note":""}]}',
      },
    ]);
    const meter = new CostMeter({ scope: { kind: "guide", id: "g" } });
    const calls = await new WonderAuditor({ api, meter }).reviewSafety({
      title: "Clean an iron",
      steps,
    });
    expect(calls).toEqual([
      { level: "stop", note: "Unplug and let it cool." },
      { level: "caution", note: "Mind the edges." },
      { level: "none" },
    ]);
    expect(api.bodies[0]?.model).toBe("muse-wonder-1.0");
    expect(meter.events[0]?.usage).toMatchObject({ unit: "tokens", model: "muse-wonder-1.0" });
  });

  it("refuses a review that skips steps", async () => {
    const api = new StubMetaApi([{ text: '{"steps":[{"level":"none"}]}' }]);
    await expect(new WonderAuditor({ api }).reviewSafety({ title: "x", steps })).rejects.toThrow(
      /1 of 3/,
    );
  });

  it("audits a run and drops references to steps that do not exist", async () => {
    const api = new StubMetaApi([
      {
        text: JSON.stringify({
          summary: "Mostly right. Step 2 needs a look.",
          concerns: [
            { stepIndex: 1, note: "Unverified." },
            { stepIndex: 9, note: "Made up." },
          ],
          suggestions: [{ stepIndex: "1", suggestion: "Show the screw positions." }],
        }),
      },
    ]);
    const audit = await new WonderAuditor({ api }).auditRun({
      title: "Clean an iron",
      steps: steps.map((s) => ({ title: s.title, doneWhen: "x" })),
      report,
    });
    expect(audit).toEqual({
      summary: "Mostly right. Step 2 needs a look.",
      concerns: [{ stepIndex: 1, note: "Unverified." }],
      suggestions: [{ stepIndex: 1, suggestion: "Show the screw positions." }],
      source: "model",
    });
  });
});

describe("RulesAuditor (credit-free fallback)", () => {
  it("stops on hazard words, cautions on any other warning", async () => {
    const calls = await new RulesAuditor().reviewSafety({ title: "x", steps });
    expect(calls.map((c) => c.level)).toEqual(["stop", "caution", "none"]);
  });

  it("flags unverified, unfinished and unsafe steps and suggests rewording troubled ones, labelled as rules", async () => {
    const audit = await new RulesAuditor().auditRun({
      title: "x",
      steps: steps.map((s) => ({ title: s.title, doneWhen: "x" })),
      report,
    });
    expect(audit.source).toBe("rules");
    expect(audit.summary).toMatch(/^Development mode, no model was called\./);
    expect(audit.concerns.map((c) => c.stepIndex)).toEqual([0, 1, 2]);
    expect(audit.suggestions.map((s) => s.stepIndex)).toEqual([1]);
  });
});
