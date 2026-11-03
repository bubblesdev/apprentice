import { BudgetExceededError, Step, type Detection } from "@apprentice/core";
import {
  FakeReasoner,
  FakeSegmenter,
  fixtureFrame,
  fixtureTraineeFrame,
  loadJobFixture,
  type JobFixture,
} from "@apprentice/meta/fake";
import { beforeAll, describe, expect, it } from "vitest";
import { decide } from "./decide.js";
import { CoachPolicy, DEFAULT_POLICY } from "./policy.js";
import { StepVerifier } from "./verifier.js";

let fixture: JobFixture;
beforeAll(async () => {
  fixture = await loadJobFixture("ps1_buttons");
});

const box = { x1: 1, y1: 1, x2: 9, y2: 9, w: 100, h: 100 };

/** Step n (1-based) of the recorded PS1 job, with its parts grounded. */
function recordedStep(n: number): Step {
  const draft = fixture.steps[n - 1];
  if (!draft) throw new Error(`No step ${n}`);
  return Step.parse({
    ...draft,
    index: n - 1,
    parts: draft.parts.map((name) => ({ name, sightings: [{ t: draft.endS, box }] })),
  });
}

const reference = [fixtureFrame("ps1_buttons", 60)];

describe("StepVerifier with recorded Muse Spark verdicts", () => {
  it("replays spike 2: step 3 done correctly, then the recorded 'not yet' catch", async () => {
    const verifier = new StepVerifier({
      reasoner: new FakeReasoner({ fixture }),
      segmenter: new FakeSegmenter(fixture, { concepts: ["top cover", "Power button cap"] }),
      policy: DEFAULT_POLICY,
    });
    const step = recordedStep(3);
    const done = await verifier.sample({
      step,
      reference,
      live: [{ key: "f1", media: fixtureTraineeFrame("ps1_buttons", 3, "correct") }],
    });
    expect(done.judgement).toMatchObject({ kind: "done", confidence: 0.88 });
    expect(done.parts.map((p) => [p.name, p.present])).toEqual([
      ["top cover", true],
      ["Power button cap", true],
    ]);
    expect(done.frameKeys).toEqual(["f1"]);

    const early = await verifier.sample({
      step,
      reference,
      live: [{ key: "f2", media: fixtureTraineeFrame("ps1_buttons", 3, "earlier") }],
    });
    expect(decide([early], DEFAULT_POLICY)).toMatchObject({ kind: "not_yet" });
  });

  it("catches the recorded thick-grease mistake on step 4 as a retry", async () => {
    const verifier = new StepVerifier({
      reasoner: new FakeReasoner({ fixture }),
      policy: DEFAULT_POLICY,
    });
    const s = await verifier.sample({
      step: recordedStep(4),
      reference,
      live: [{ key: "f", media: fixtureTraineeFrame("ps1_buttons", 4, "correct") }],
    });
    expect(decide([s], DEFAULT_POLICY)).toMatchObject({ kind: "retry", verdict: "wrong" });
  });

  it("sends only the newest frames, as many as the policy allows", async () => {
    const reasoner = new FakeReasoner({
      fixture,
      judge: ({ live }) => ({ kind: "done", confidence: 0.9, sentence: `${live.length} frames` }),
    });
    const verifier = new StepVerifier({
      reasoner,
      policy: CoachPolicy.parse({ framesPerSample: 2 }),
    });
    const live = ["a", "b", "c"].map((key, i) => ({ key, media: fixtureFrame("ps1_buttons", i) }));
    const s = await verifier.sample({ step: recordedStep(2), reference, live });
    expect(s.frameKeys).toEqual(["b", "c"]);
  });
});

describe("StepVerifier failure handling", () => {
  const step = (): Step => recordedStep(3);
  const live = [{ key: "f", media: fixtureFrame("ps1_buttons", 1) }];

  it("checks only parts SAM grounded in the expert's frames", async () => {
    const segmenter = new FakeSegmenter(fixture);
    const verifier = new StepVerifier({
      reasoner: new FakeReasoner({ fixture }),
      segmenter,
      policy: DEFAULT_POLICY,
    });
    const ungrounded = Step.parse({ ...step(), parts: [{ name: "Power button cap" }] });
    const s = await verifier.sample({ step: ungrounded, reference, live });
    expect(s.parts).toEqual([]);
    expect(segmenter.calls).toEqual([]);
  });

  it("records a model failure as an error sample, never as a pass", async () => {
    const reasoner = new FakeReasoner({ fixture });
    reasoner.judgeStep = async () => {
      throw new Error("Model output is not valid JSON");
    };
    const s = await new StepVerifier({ reasoner, policy: DEFAULT_POLICY }).sample({
      step: step(),
      reference,
      live,
    });
    expect(s).toMatchObject({
      judgement: { kind: "unclear", confidence: 0 },
      error: { kind: "model" },
    });
  });

  it("marks a spent budget so the coach can offer a manual confirmation", async () => {
    const reasoner = new FakeReasoner({ fixture });
    reasoner.judgeStep = async () => {
      throw new BudgetExceededError(0.06, 0.05);
    };
    const s = await new StepVerifier({ reasoner, policy: DEFAULT_POLICY }).sample({
      step: step(),
      reference,
      live,
    });
    expect(s.error?.kind).toBe("budget");
  });

  it("treats a failed or weak presence check as missing", async () => {
    const weak: Detection[] = [{ objectId: 0, box, confidence: 0.2 }];
    const segmenter = new FakeSegmenter(fixture, {
      find: (_image, concept) => {
        if (concept === "top cover") throw new Error("SAM unavailable");
        return weak;
      },
    });
    const verifier = new StepVerifier({
      reasoner: new FakeReasoner({ fixture }),
      segmenter,
      policy: DEFAULT_POLICY,
    });
    const s = await verifier.sample({ step: step(), reference, live });
    expect(s.parts).toEqual([
      { name: "top cover", present: false },
      { name: "Power button cap", present: false, confidence: 0.2, box },
    ]);
  });

  it("returns an error sample when there are no live frames", async () => {
    const verifier = new StepVerifier({
      reasoner: new FakeReasoner({ fixture }),
      policy: DEFAULT_POLICY,
    });
    expect((await verifier.sample({ step: step(), reference, live: [] })).error?.kind).toBe(
      "model",
    );
  });
});

describe("StepVerifier.groundedParts", () => {
  const step = (sightings: Record<string, number[]>, referenceTimesS: number[]) =>
    Step.parse({
      index: 0,
      title: "Remove the battery",
      instruction: "Lift the battery out.",
      startS: 0,
      endS: 10,
      doneWhen: "Bay empty.",
      referenceTimesS,
      parts: Object.entries(sightings).map(([name, ts]) => ({
        name,
        sightings: ts.map((t) => ({ t, box })),
      })),
    });

  it("requires only parts seen in the expert's finished frame", () => {
    const s = step({ battery: [6, 8], "battery bay": [8, 10], screwdriver: [] }, [6, 8, 10]);
    expect(StepVerifier.groundedParts(s)).toEqual(["battery bay"]);
  });

  it("falls back to any sighting when the step has no reference times", () => {
    const s = step({ battery: [6], screwdriver: [] }, []);
    expect(StepVerifier.groundedParts(s)).toEqual(["battery"]);
  });
});
