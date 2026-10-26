import { Step, type CoachUpdate } from "@apprentice/core";
import { describe, expect, it } from "vitest";
import { coachView, sentences } from "./coachView";

const box = { x1: 1, y1: 1, x2: 2, y2: 2, w: 10, h: 10 };
const steps = [
  Step.parse({
    index: 0,
    title: "Remove the Power cap",
    instruction: "Press the clips and push the cap out.",
    startS: 0,
    endS: 10,
    doneWhen: "Cap out.",
    parts: [{ name: "Power cap", sightings: [{ t: 9, box }] }, { name: "silicone grease" }],
    safety: { level: "caution", note: "Unplug the console first." },
  }),
  Step.parse({
    index: 1,
    title: "Test",
    instruction: "Press it.",
    startS: 10,
    endS: 20,
    doneWhen: "Returns.",
  }),
];

function update(
  state: CoachUpdate["session"]["state"],
  extra: Partial<CoachUpdate> = {},
  stepIndex = 0,
): CoachUpdate {
  return {
    session: {
      id: "s",
      guideId: "g",
      guideVersion: 1,
      state,
      stepIndex,
      verdicts: [],
      startedAt: "2026-10-27T10:00:00.000Z",
    },
    canOverride: false,
    sampling: { framesPerSample: 2, sampleIntervalMs: 1500 },
    ...extra,
  };
}

describe("coachView", () => {
  it("briefs with the safety note and speaks it", () => {
    const v = coachView(update("briefing"), steps);
    expect(v.panel).toEqual({ kind: "briefing", warning: "Unplug the console first." });
    expect(v.spoken).toBe("Press the clips and push the cap out. Unplug the console first.");
    expect(v).toMatchObject({ stepNumber: 1, total: 2, progress: 0 });
  });

  it("names the grounded parts while verifying", () => {
    expect(coachView(update("verifying"), steps).panel).toEqual({
      kind: "verifying",
      detail: "Looking at the Power cap",
    });
    expect(coachView(update("verifying", {}, 1), steps).panel).toMatchObject({
      detail: "Comparing with the expert's finished step",
    });
  });

  it("counts a passed step in the progress and knows the last step", () => {
    const v = coachView(
      update("passed", { decision: { kind: "pass", sentence: "Socket empty." } }, 1),
      steps,
    );
    expect(v.progress).toBe(1);
    expect(v.panel).toEqual({ kind: "pass", sentence: "Socket empty.", last: true });
  });

  it.each([
    ["parts_missing", ["Power cap"], "Show me the Power cap"],
    ["low_confidence", [], "Show me closer"],
    ["model_error", [], "I couldn't check that"],
    ["unavailable", [], "Checking is paused"],
  ])("titles a closer request for %s", (reason, missingParts, title) => {
    const v = coachView(
      update("closer", {
        decision: { kind: "closer", sentence: "x", reason, missingParts },
        canOverride: true,
      }),
      steps,
    );
    expect(v.tone).toBe("amber");
    expect(v.panel).toMatchObject({ kind: "closer", title, canOverride: true });
  });

  it("uses coral for mistakes and unsafe stops", () => {
    const wrong = coachView(
      update("retry", { decision: { kind: "retry", sentence: "Thick blob.", reason: "wrong" } }),
      steps,
    );
    const skipped = coachView(
      update("retry", { decision: { kind: "retry", sentence: "No grease.", reason: "skipped" } }),
      steps,
    );
    const stop = coachView(
      update("blocked", { decision: { kind: "stop", sentence: "Plugged in." } }),
      steps,
    );
    expect([wrong.tone, skipped.tone, stop.tone]).toEqual(["coral", "coral", "coral"]);
    expect(wrong.panel).toMatchObject({ title: "Not quite right" });
    expect(skipped.panel).toMatchObject({ title: "A step looks skipped" });
    expect(stop.spoken).toBe("Stop. Plugged in.");
  });

  it("shows a not-finished note in amber after a not_yet verdict", () => {
    const v = coachView(
      update("doing", { decision: { kind: "not_yet", sentence: "Cap still seated." } }),
      steps,
    );
    expect(v.tone).toBe("amber");
    expect(v.panel).toEqual({
      kind: "doing",
      note: { title: "Not finished yet", sentence: "Cap still seated." },
    });
  });

  it("never uses an em dash in anything it shows or says", () => {
    const states = [
      "briefing",
      "doing",
      "verifying",
      "passed",
      "closer",
      "retry",
      "blocked",
      "complete",
    ] as const;
    for (const state of states)
      expect(JSON.stringify(coachView(update(state), steps))).not.toContain("\u2014");
  });

  it("joins spoken sentences without doubling full stops", () => {
    expect(sentences("Stop", "Plugged in.", undefined, " ")).toBe("Stop. Plugged in.");
  });
});
