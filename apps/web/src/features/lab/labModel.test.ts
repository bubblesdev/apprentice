import { describe, expect, it } from "vitest";
import {
  clock,
  currentStep,
  emptyDraft,
  labReducer,
  labWarnings,
  labelsFileName,
  toRecordingLabels,
  type LabAction,
} from "./labModel";

const guide = { id: "g", version: 3, steps: [{}, {}, {}] } as const;
const apply = (...actions: LabAction[]) => actions.reduce(labReducer, emptyDraft(guide));

describe("lab model", () => {
  it("marks steps in order, keeps notes across re-marks, and exports RecordingLabels", () => {
    const draft = apply(
      { type: "mark", stepIndex: 0, endS: 12.34, outcome: "done" },
      { type: "mark", stepIndex: 1, endS: 14, outcome: "wrong" },
      { type: "note", stepIndex: 1, value: "  Wrong screw  " },
      { type: "mark", stepIndex: 1, endS: 15.06, outcome: "wrong" },
    );
    expect(currentStep(guide, draft)).toBe(2);
    expect(toRecordingLabels(draft, { name: "try-1.mp4", durationS: 60.04 }, "First try")).toEqual({
      version: 1,
      guideId: "g",
      guideVersion: 3,
      video: { name: "try-1.mp4", durationS: 60 },
      description: "First try",
      steps: [
        { stepIndex: 0, endS: 12.3, outcome: "done" },
        { stepIndex: 1, endS: 15.1, outcome: "wrong", note: "Wrong screw" },
      ],
    });
  });

  it("clears and resets, and refuses to export nothing", () => {
    const draft = apply(
      { type: "mark", stepIndex: 0, endS: 1, outcome: "done" },
      { type: "clear", stepIndex: 0 },
    );
    expect(currentStep(guide, draft)).toBe(0);
    expect(() => toRecordingLabels(draft, { name: "v", durationS: 5 })).toThrow();
    const full = apply(
      ...[0, 1, 2].map(
        (k) => ({ type: "mark", stepIndex: k, endS: k, outcome: "skipped" }) as const,
      ),
    );
    expect(currentStep(guide, full)).toBeUndefined();
    expect(labReducer(full, { type: "reset" }).marks).toEqual({});
  });

  it("warns about marks out of order, past the end, or missing", () => {
    const draft = apply(
      { type: "mark", stepIndex: 0, endS: 20, outcome: "done" },
      { type: "mark", stepIndex: 1, endS: 10, outcome: "done" },
    );
    expect(labWarnings(guide, draft, 15)).toEqual([
      "Step 1 is marked after the end of the video.",
      "Step 2 is marked before step 1 ends.",
      "1 step has no mark and will be left out.",
    ]);
    expect(labWarnings(guide, emptyDraft(guide))).toEqual([]);
  });

  it("formats times and file names", () => {
    expect(clock(75.25)).toBe("1:15.3");
    expect(clock(4)).toBe("0:04.0");
    expect(labelsFileName("Try 1.MOV")).toBe("Try 1.labels.json");
  });
});
