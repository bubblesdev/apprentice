import { InMemoryMediaStore } from "@apprentice/core";
import {
  FakeFrameExtractor,
  FakeIllustrator,
  FakeReasoner,
  FakeSegmenter,
  RulesAuditor,
  loadJobFixture,
  type JobFixture,
} from "@apprentice/meta/fake";
import { beforeAll, describe, expect, it } from "vitest";
import { buildGuide, type PipelineProgress } from "./build.js";
import { MemoryArtifactStore } from "./stage.js";
import { mergeSafety } from "./stages/safety.js";

let fixture: JobFixture;
beforeAll(async () => {
  fixture = await loadJobFixture("ps1_buttons");
});

function deps() {
  return {
    reasoner: new FakeReasoner({
      fixture,
      boundaries: {
        "Inspect Power button and apply silicone grease": {
          endS: 141,
          confidence: 0.85,
          sentence: "Film thin.",
        },
      },
    }),
    segmenter: new FakeSegmenter(fixture),
    frames: new FakeFrameExtractor("ps1_buttons"),
  };
}

const input = () => ({
  guideId: "ps1",
  source: {
    id: "src1",
    kind: "video" as const,
    title: "Fix sticky PlayStation buttons",
    location: "samples/ps1_buttons.mp4",
    durationS: fixture.source.durationS,
    attribution: fixture.source.attribution,
  },
  media: { kind: "provider_file" as const, fileId: "file-ps1" },
});

describe("buildGuide on the recorded PS1 job", () => {
  it("builds a validated 10-step guide with refined ends, references and grounded parts", async () => {
    const progress: PipelineProgress[] = [];
    const { guide, boundaries } = await buildGuide(input(), deps(), {
      store: new MemoryArtifactStore(),
      onProgress: (p) => progress.push(p),
    });
    expect(guide).toMatchObject({ id: "ps1", status: "draft", version: 1 });
    expect(guide.source.attribution).toBe("Wikimedia Commons, CC BY 3.0");
    expect(guide.steps).toHaveLength(10);
    expect(guide.steps.map((s) => s.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(guide.steps[3]).toMatchObject({ startS: 68, endS: 141 });
    expect(guide.steps[4]?.startS).toBe(141);
    expect(boundaries.filter((b) => b.changed)).toHaveLength(1);
    expect(guide.steps.every((s) => s.referenceTimesS.length === 3)).toBe(true);
    expect(guide.steps[3]?.referenceTimesS.every((t) => t > 68 && t <= 141)).toBe(true);

    const screwdriver = guide.steps[1]?.parts.find((p) => p.name === "Phillips screwdriver");
    const grease = guide.steps[3]?.parts.find((p) => p.name === "silicone grease");
    expect(screwdriver?.sightings).toHaveLength(2);
    expect(grease?.sightings).toEqual([]);

    expect(guide.steps[0]?.safety).toEqual({
      level: "caution",
      note: "Unplug power and remove disc and cables before handling",
    });
    expect(progress.filter((p) => p.state === "done").map((p) => p.detail)).toEqual([
      "10 steps found",
      "1 step ends adjusted",
      "30 reference frames",
      expect.stringMatching(/^\d+ of \d+ parts located$/),
    ]);
  });

  it("is idempotent: a rebuild with the same store makes no model calls", async () => {
    const store = new MemoryArtifactStore();
    await buildGuide(input(), deps(), { store });
    const again = deps();
    const progress: PipelineProgress[] = [];
    await buildGuide(input(), again, { store, onProgress: (p) => progress.push(p) });
    expect(again.reasoner.calls).toEqual([]);
    expect(again.segmenter.calls).toEqual([]);
    expect(progress.filter((p) => p.state === "done").every((p) => p.reused)).toBe(true);
  });

  it("re-runs only the stages whose input changed", async () => {
    const store = new MemoryArtifactStore();
    await buildGuide(input(), deps(), { store });
    const again = deps();
    const progress: PipelineProgress[] = [];
    await buildGuide(input(), again, {
      store,
      config: { referenceFractions: [0.9, 1] },
      onProgress: (p) => progress.push(p),
    });
    const reused = Object.fromEntries(
      progress.filter((p) => p.state === "done").map((p) => [p.stage, p.reused]),
    );
    expect(reused).toEqual({
      draft_steps: true,
      refine_boundaries: true,
      reference_frames: false,
      ground_parts: false,
    });
    expect(again.reasoner.calls).toEqual([]);
    expect(again.segmenter.calls.length).toBeGreaterThan(0);
  });

  it("drafts document sources from text and skips the video-only stages", async () => {
    const d = deps();
    const progress: PipelineProgress[] = [];
    const { guide } = await buildGuide(
      {
        ...input(),
        source: { id: "doc", kind: "document", title: "Manual", location: "manual.md" },
        media: { kind: "url", url: "https://example.com/manual.md" },
        documentText: "1. Unplug the console.",
      },
      d,
      { store: new MemoryArtifactStore(), onProgress: (p) => progress.push(p) },
    );
    expect(guide.steps).toHaveLength(10);
    expect(d.reasoner.calls).toEqual(["draft_steps"]);
    expect(d.segmenter.calls).toEqual([]);
    expect(progress.filter((p) => p.state === "skipped").map((p) => p.stage)).toEqual([
      "refine_boundaries",
      "ground_parts",
      "draw_diagrams",
      "review_safety",
    ]);
  });

  it("rejects input that fails validation", async () => {
    await expect(
      buildGuide({ ...input(), guideId: "" }, deps(), { store: new MemoryArtifactStore() }),
    ).rejects.toThrow();
  });

  it("draws a diagram per step with an illustrator, storing each in the media store", async () => {
    const illustrator = new FakeIllustrator();
    const media = new InMemoryMediaStore();
    const store = new MemoryArtifactStore();
    const { guide } = await buildGuide(input(), { ...deps(), illustrator, media }, { store });
    const keys = guide.steps.map((s) => s.diagramKey);
    expect(keys.every((k) => k?.match(/^guides\/ps1\/diagrams\/\d+-[0-9a-f]{12}\.svg$/))).toBe(
      true,
    );
    expect((await media.get(keys[0] ?? ""))?.mime).toBe("image/svg+xml");
    expect(illustrator.calls).toHaveLength(10);
    await buildGuide(input(), { ...deps(), illustrator, media }, { store });
    expect(illustrator.calls).toHaveLength(10);
  });

  it("keeps building when one diagram fails", async () => {
    const illustrator = new FakeIllustrator();
    const original = illustrator.diagram.bind(illustrator);
    illustrator.diagram = async (i: Parameters<FakeIllustrator["diagram"]>[0]) =>
      i.title.startsWith("Test") ? Promise.reject(new Error("no image")) : original(i);
    const { guide } = await buildGuide(
      input(),
      { ...deps(), illustrator, media: new InMemoryMediaStore() },
      { store: new MemoryArtifactStore() },
    );
    expect(guide.steps.at(-1)?.diagramKey).toBeUndefined();
    expect(guide.steps[0]?.diagramKey).toBeDefined();
  });

  it("has Muse Wonder (here the rules fallback) review safety; the more severe level wins", async () => {
    const { guide } = await buildGuide(
      input(),
      { ...deps(), auditor: new RulesAuditor() },
      { store: new MemoryArtifactStore() },
    );
    // Step 1's warning says to unplug the console: a stop that the trainee must acknowledge.
    expect(guide.steps[0]?.safety).toEqual({
      level: "stop",
      note: "Unplug power and remove disc and cables before handling",
    });
    expect(guide.steps.every((s) => s.safety.level !== "none")).toBe(true);
  });

  it("keeps the draft's warnings when the safety review fails", async () => {
    const auditor = new RulesAuditor();
    auditor.reviewSafety = async () => Promise.reject(new Error("Wonder unavailable"));
    const progress: PipelineProgress[] = [];
    const { guide } = await buildGuide(
      input(),
      { ...deps(), auditor },
      { store: new MemoryArtifactStore(), onProgress: (p) => progress.push(p) },
    );
    expect(guide.steps[0]?.safety.level).toBe("caution");
    expect(progress.at(-1)).toMatchObject({ stage: "review_safety", state: "skipped" });
  });
});

describe("mergeSafety", () => {
  it("takes the more severe level and the review's note", () => {
    expect(mergeSafety({ level: "caution", note: "a" }, { level: "stop", note: "b" })).toEqual({
      level: "stop",
      note: "b",
    });
    expect(mergeSafety({ level: "stop", note: "a" }, { level: "none" })).toEqual({
      level: "stop",
      note: "a",
    });
    expect(mergeSafety({ level: "none" }, undefined)).toEqual({ level: "none" });
  });
});
