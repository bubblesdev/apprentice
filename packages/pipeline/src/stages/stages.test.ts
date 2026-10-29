import type { BoundaryEstimate, StepDraft } from "@apprentice/core";
import {
  FakeFrameExtractor,
  FakeReasoner,
  FakeSegmenter,
  loadJobFixture,
  type JobFixture,
} from "@apprentice/meta/fake";
import { beforeAll, describe, expect, it } from "vitest";
import { PipelineConfig } from "../config.js";
import { boundaryStage, windowTimes } from "./boundaries.js";
import { groundingStage } from "./grounding.js";
import { referenceTimes } from "./references.js";

let fixture: JobFixture;
beforeAll(async () => {
  fixture = await loadJobFixture("ps1_buttons");
});

const media = { kind: "url", url: "fixture://ps1_buttons/source" } as const;
const config = PipelineConfig.parse({});
const GREASE = "Inspect Power button and apply silicone grease";

function deps(boundaries: Record<string, BoundaryEstimate> = {}) {
  return {
    reasoner: new FakeReasoner({ fixture, boundaries }),
    segmenter: new FakeSegmenter(fixture),
    frames: new FakeFrameExtractor("ps1_buttons"),
  };
}

const steps = (): StepDraft[] => fixture.steps.map((s) => ({ ...s }));

describe("windowTimes", () => {
  it("samples densely around the drafted end, inside the bounds", () => {
    expect(windowTimes(135, 127, 143, 2)).toEqual([127, 129, 131, 133, 135, 137, 139, 141, 143]);
    expect(windowTimes(10, 8, 11, 2)).toEqual([8, 10]);
    expect(windowTimes(20, 8, 11, 2)).toEqual([8, 10, 11]);
  });
});

describe("boundary refinement", () => {
  it("moves a step end to the confident finished frame and starts the next step there", async () => {
    const d = deps({
      [GREASE]: { endS: 141, confidence: 0.85, sentence: "Thin film, excess wiped." },
    });
    const out = await boundaryStage.run(
      { media, durationS: 463.8, steps: steps(), config: config.boundary },
      d,
    );
    expect(out.steps[3]).toMatchObject({ startS: 68, endS: 141 });
    expect(out.steps[4]).toMatchObject({ startS: 141, endS: 165 });
    expect(out.notes.filter((n) => n.changed)).toEqual([
      {
        index: 3,
        draftEndS: 135,
        endS: 141,
        confidence: 0.85,
        sentence: "Thin film, excess wiped.",
        changed: true,
      },
    ]);
  });

  it("asks about dense frames around each drafted end, with the next step as context", async () => {
    const d = deps();
    await boundaryStage.run(
      { media, durationS: 463.8, steps: steps(), config: config.boundary },
      d,
    );
    expect(d.reasoner.calls.filter((c) => c === "refine_boundary")).toHaveLength(10);
    const times = d.frames.requested.filter((t) => t > 120 && t < 150);
    expect(Math.min(...times)).toBe(127);
    expect(Math.max(...times)).toBe(143);
  });

  it.each([
    ["low confidence", { endS: 141, confidence: 0.4, sentence: "Maybe." }],
    ["no finished frame", { endS: null, confidence: 0.9, sentence: "Still greasing." }],
    ["before the step starts", { endS: 60, confidence: 0.9, sentence: "Odd." }],
  ])("keeps the drafted end on %s", async (_label, estimate) => {
    const out = await boundaryStage.run(
      { media, durationS: 463.8, steps: steps(), config: config.boundary },
      deps({ [GREASE]: estimate }),
    );
    expect(out.steps[3]?.endS).toBe(135);
    expect(out.notes.every((n) => !n.changed)).toBe(true);
  });

  it("never makes steps overlap or reorder", async () => {
    const all = Object.fromEntries(
      fixture.steps.map((s) => [
        s.title,
        { endS: s.endS + 6, confidence: 0.9, sentence: "Later." },
      ]),
    );
    const out = await boundaryStage.run(
      { media, durationS: 463.8, steps: steps(), config: config.boundary },
      deps(all),
    );
    for (let i = 1; i < out.steps.length; i++) {
      const prev = out.steps[i - 1];
      const cur = out.steps[i];
      expect(cur && prev && cur.startS).toBe(prev?.endS);
      expect(cur && cur.endS >= cur.startS).toBe(true);
    }
    expect(out.steps.at(-1)?.endS).toBeLessThanOrEqual(463.8);
  });
});

describe("reference frames", () => {
  it("takes frames late in the step, where the finished state shows", () => {
    expect(referenceTimes(68, 135, [0.6, 0.85, 0.98])).toEqual([108.2, 124.95, 133.66]);
    expect(referenceTimes(0, 0, [0.5])).toEqual([]);
  });
});

describe("part grounding", () => {
  it("records SAM sightings at the latest reference frames for each part", async () => {
    const d = deps();
    const out = await groundingStage.run(
      {
        media,
        steps: [
          { parts: ["Phillips screwdriver", "silicone grease"], referenceTimesS: [100, 120, 130] },
        ],
        config: config.grounding,
      },
      d,
    );
    const [screwdriver, grease] = out.parts[0] ?? [];
    expect(screwdriver?.sightings?.map((s) => s.t)).toEqual([120, 130]);
    expect(grease?.sightings).toEqual([]);
    expect(d.frames.requested).toEqual([120, 130]);
  });

  it("ignores detections below the presence threshold", async () => {
    const d = deps();
    d.segmenter = new FakeSegmenter(fixture, {
      find: () => [
        { objectId: 0, box: { x1: 0, y1: 0, x2: 1, y2: 1, w: 2, h: 2 }, confidence: 0.2 },
      ],
    });
    const out = await groundingStage.run(
      {
        media,
        steps: [{ parts: ["screwdriver"], referenceTimesS: [5] }],
        config: config.grounding,
      },
      d,
    );
    expect(out.parts[0]?.[0]?.sightings).toEqual([]);
  });
});
