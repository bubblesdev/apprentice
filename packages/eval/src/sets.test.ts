import { CoachPolicy } from "@apprentice/coach";
import { BudgetExceededError, Guide, RecordingLabels, type StepJudgement } from "@apprentice/core";
import {
  FakeFrameExtractor,
  FakeReasoner,
  loadJobFixture,
  parseFixtureMedia,
} from "@apprentice/meta/fake";
import { describe, expect, it } from "vitest";
import { compareReport } from "./report.js";
import { runEvalSet } from "./runner.js";
import { EvalSet, recordingCases, syntheticCases } from "./sets.js";

const guide = Guide.parse({
  id: "g",
  title: "Descale a kettle",
  status: "approved",
  version: 2,
  source: { id: "s", kind: "video", title: "Kettle", location: "file:///videos/kettle.mp4" },
  steps: [
    {
      index: 0,
      title: "Unplug",
      instruction: "Unplug it.",
      startS: 0,
      endS: 10,
      doneWhen: "Unplugged.",
      referenceTimesS: [7, 8.5, 9.8],
    },
    {
      index: 1,
      title: "Fill",
      instruction: "Fill it.",
      startS: 10,
      endS: 30,
      doneWhen: "Half full.",
      referenceTimesS: [22, 27, 29.6],
    },
    {
      index: 2,
      title: "Rinse",
      instruction: "Rinse it.",
      startS: 30,
      endS: 40,
      doneWhen: "Clean.",
      referenceTimesS: [36, 38.5, 39.8],
    },
    { index: 3, title: "Tiny", instruction: "Tap.", startS: 40, endS: 41, doneWhen: "Tapped." },
  ],
});

describe("syntheticCases", () => {
  it("cuts done and not-yet cases from each step, avoiding the reference frames", () => {
    const cases = syntheticCases(guide);
    expect(cases.map((c) => c.id)).toEqual([
      "s1-done",
      "s1-start",
      "s2-done",
      "s2-start",
      "s3-done",
      "s3-start",
      "s3-earlier",
    ]);
    expect(cases.find((c) => c.id === "s2-done")).toMatchObject({
      label: "done",
      frameTimesS: [28.4, 29.2],
    });
    expect(cases.find((c) => c.id === "s3-earlier")).toMatchObject({
      label: "not_yet",
      frameTimesS: [6, 9],
    });
    const refs = new Set(guide.steps.flatMap((s) => s.referenceTimesS));
    expect(cases.flatMap((c) => c.frameTimesS).some((t) => refs.has(t))).toBe(false);
    expect(cases.every((c) => c.origin === "synthetic" && c.label !== "skipped")).toBe(true);
  });
});

describe("recordingCases", () => {
  it("turns a person's labels into gold cases, including skips and wrong parts", () => {
    const labels = RecordingLabels.parse({
      version: 1,
      guideId: "g",
      guideVersion: 2,
      video: { name: "trainee-1.mp4", durationS: 60 },
      steps: [
        { stepIndex: 0, endS: 12, outcome: "done" },
        { stepIndex: 1, endS: 14, outcome: "skipped" },
        { stepIndex: 2, endS: 35, outcome: "wrong", note: "Rinsed once, not three times" },
      ],
    });
    expect(recordingCases(labels)).toEqual([
      { id: "r1-done", stepIndex: 0, label: "done", origin: "recording", frameTimesS: [10, 12] },
      { id: "r1-start", stepIndex: 0, label: "not_yet", origin: "recording", frameTimesS: [1.5] },
      { id: "r2-skipped", stepIndex: 1, label: "skipped", origin: "recording", frameTimesS: [14] },
      {
        id: "r3-wrong",
        stepIndex: 2,
        label: "wrong",
        origin: "recording",
        frameTimesS: [33, 35],
        note: "Rinsed once, not three times",
      },
      { id: "r3-start", stepIndex: 2, label: "not_yet", origin: "recording", frameTimesS: [15.5] },
    ]);
  });

  it("refuses labels that list a step twice", () => {
    const twice = {
      version: 1,
      guideId: "g",
      guideVersion: 1,
      video: { name: "v", durationS: 5 },
      steps: [0, 0].map((i) => ({ stepIndex: i, endS: 1, outcome: "done" })),
    };
    expect(RecordingLabels.safeParse(twice).success).toBe(false);
  });
});

describe("runEvalSet", () => {
  const set = (): EvalSet =>
    EvalSet.parse({
      name: "kettle synthetic",
      createdAt: "2026-10-27T10:00:00.000Z",
      guide,
      expertVideo: "/videos/kettle.mp4",
      traineeVideo: "/videos/kettle.mp4",
      cases: syntheticCases(guide),
    });

  async function reasoner(judge: (live: string[]) => StepJudgement) {
    const fixture = await loadJobFixture("ps1_buttons");
    return new FakeReasoner({
      fixture,
      judge: ({ live }) => judge(live.map((m) => (m.kind === "url" ? m.url : ""))),
    });
  }

  it("judges every case like the coach, with the expert's reference frames, reusing them per step", async () => {
    const frames = new FakeFrameExtractor("kettle");
    const seen: number[] = [];
    const r = await reasoner((live) => {
      const t = Number(parseFixtureMedia({ kind: "url", url: live[0] ?? "" })?.params.get("t"));
      seen.push(t);
      return { kind: "done", confidence: 0.9, sentence: `saw ${t}` };
    });
    const out = await runEvalSet(set(), { reasoner: r, frames });
    expect(out).toMatchObject({ judged: 7, errors: 0, stoppedEarly: false });
    expect(out.run.cases[0]).toEqual({
      id: "s1-done",
      stepIndex: 0,
      label: "done",
      origin: "synthetic",
      predicted: { kind: "done", confidence: 0.9, sentence: "saw 9.2" },
    });
    const referenceCalls = frames.requested.filter((t) =>
      [7, 8.5, 9.8, 22, 27, 29.6, 36, 38.5, 39.8].includes(t),
    );
    expect(referenceCalls).toHaveLength(9);
  });

  it("records a failed call as unclear, and stops cleanly when the budget runs out", async () => {
    let calls = 0;
    const r = await reasoner(() => {
      calls++;
      if (calls === 1) throw new Error("bad json");
      if (calls === 3) throw new BudgetExceededError(1, 1);
      return { kind: "not_yet", confidence: 0.8, sentence: "ok" };
    });
    const out = await runEvalSet(set(), { reasoner: r, frames: new FakeFrameExtractor("kettle") });
    expect(out).toMatchObject({ judged: 1, errors: 1, stoppedEarly: true });
    expect(out.run.cases[0]?.predicted).toMatchObject({ kind: "unclear", confidence: 0 });
  });
});

describe("compareReport", () => {
  it("shows gate deltas and only the cases whose gate outcome changed", () => {
    const run = (kind: "done" | "unclear", name = "r") => ({
      name,
      cases: [
        { id: "a", stepIndex: 0, label: "done" as const, predicted: { kind, confidence: 0.9 } },
        {
          id: "b",
          stepIndex: 0,
          label: "not_yet" as const,
          predicted: { kind: "not_yet" as const, confidence: 0.9 },
        },
      ],
    });
    const text = compareReport(run("unclear"), run("done"), CoachPolicy.parse({}));
    expect(text).toContain("## r: before and after");
    expect(text).toContain("| Pass rate | 0% | 100% | +100 pts |");
    expect(text).toContain("| a | done | unclear | done | better |");
    expect(text).not.toContain("| b |");
  });
});
