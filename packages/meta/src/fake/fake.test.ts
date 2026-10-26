import { beforeAll, describe, expect, it } from "vitest";
import { FakeFrameExtractor } from "./fake-frames.js";
import { FakeReasoner } from "./fake-reasoner.js";
import { FakeSegmenter } from "./fake-segmenter.js";
import {
  fixtureFrame,
  fixtureSource,
  fixtureTraineeFrame,
  parseFixtureMedia,
} from "./fixture-media.js";
import { loadJobFixture, type JobFixture } from "./fixtures.js";

let fixture: JobFixture;
beforeAll(async () => {
  fixture = await loadJobFixture("ps1_buttons");
});

describe("loadJobFixture", () => {
  it("loads spike 1 steps and spike 2 verdicts, validated", () => {
    expect(fixture.source.attribution).toBe("Wikimedia Commons, CC BY 3.0");
    expect(fixture.steps).toHaveLength(10);
    expect(fixture.steps[2]).toMatchObject({
      title: "Isolate top cover and remove Power button cap",
      startS: 48,
      endS: 68,
    });
    expect(fixture.judgements).toHaveLength(21);
    expect(fixture.finishChecks).toHaveLength(16);
    expect(Object.keys(fixture.samConcepts)).toEqual([
      "round button",
      "plastic bracket",
      "screwdriver",
    ]);
  });
});

describe("fixture media", () => {
  it("round-trips the job and parameters", () => {
    const ref = parseFixtureMedia(fixtureTraineeFrame("ps1_buttons", 4, "correct"));
    expect(ref?.job).toBe("ps1_buttons");
    expect(ref?.kind).toBe("trainee");
    expect(ref?.params.get("case")).toBe("correct");
    expect(parseFixtureMedia({ kind: "url", url: "https://example.com/a.jpg" })).toBeUndefined();
  });
});

describe("FakeReasoner", () => {
  const step = {
    title: "Inspect Power button and apply silicone grease",
    instruction: "x",
    doneWhen: "y",
  };

  it("replays the recorded step split", async () => {
    const reasoner = new FakeReasoner({ fixture });
    expect((await reasoner.draftSteps()).map((s) => s.title)).toEqual(
      fixture.steps.map((s) => s.title),
    );
    expect(reasoner.calls).toEqual(["draft_steps"]);
  });

  it("replays the recorded verdict for a trainee frame", async () => {
    const reasoner = new FakeReasoner({ fixture });
    const verdict = await reasoner.judgeStep({
      step,
      reference: [],
      live: [fixtureTraineeFrame("ps1_buttons", 4, "correct")],
    });
    expect(verdict.kind).toBe("wrong");
    expect(verdict.sentence).toMatch(/thick opaque white blob/);
  });

  it("answers unclear, never a guess, for frames it has no recording of", async () => {
    const reasoner = new FakeReasoner({ fixture });
    const verdict = await reasoner.judgeStep({
      step,
      reference: [],
      live: [fixtureFrame("ps1_buttons", 3)],
    });
    expect(verdict).toMatchObject({ kind: "unclear", confidence: 0 });
  });

  it("lets coach tests script judgements", async () => {
    const reasoner = new FakeReasoner({
      fixture,
      judge: () => ({ kind: "done", confidence: 1, sentence: "ok" }),
    });
    expect((await reasoner.judgeStep({ step, reference: [], live: [] })).kind).toBe("done");
  });

  it("reports no boundary unless one is scripted", async () => {
    const scripted = { endS: 120, confidence: 0.9, sentence: "Film visible." };
    const reasoner = new FakeReasoner({ fixture, boundaries: { [step.title]: scripted } });
    expect(await reasoner.refineBoundary({ step, frames: [] })).toEqual(scripted);
    expect(
      (await reasoner.refineBoundary({ step: { ...step, title: "Other" }, frames: [] })).endS,
    ).toBeNull();
  });
});

describe("FakeSegmenter", () => {
  it("finds parts that share a word with a tracked concept", async () => {
    const segmenter = new FakeSegmenter(fixture);
    expect(
      await segmenter.findInImage(fixtureFrame("ps1_buttons", 1), "Phillips screwdriver"),
    ).toHaveLength(1);
    expect(
      await segmenter.findInImage(fixtureFrame("ps1_buttons", 1), "Power button cap"),
    ).toHaveLength(1);
    expect(await segmenter.findInImage(fixtureFrame("ps1_buttons", 1), "silicone grease")).toEqual(
      [],
    );
    expect(
      (await segmenter.trackInVideo(fixtureSource("ps1_buttons"), "plastic bracket")).size,
    ).toBe(1);
    expect(segmenter.calls).toHaveLength(4);
  });

  it("accepts an explicit concept list and scripted detections", async () => {
    const segmenter = new FakeSegmenter(fixture, {
      concepts: ["grease"],
      find: (_m, c) => (c === "cap" ? [] : undefined),
    });
    expect(
      await segmenter.findInImage(fixtureFrame("ps1_buttons", 1), "silicone grease"),
    ).toHaveLength(1);
    expect(await segmenter.findInImage(fixtureFrame("ps1_buttons", 1), "cap")).toEqual([]);
  });
});

describe("FakeFrameExtractor", () => {
  it("returns placeholder frames named by time", async () => {
    const frames = new FakeFrameExtractor("ps1_buttons");
    const frame = await frames.frameAt(fixtureSource("ps1_buttons"), 12.345);
    expect(parseFixtureMedia(frame)?.params.get("t")).toBe("12.35");
    expect(frames.requested).toEqual([12.345]);
  });
});
