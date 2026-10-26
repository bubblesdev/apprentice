import { InMemoryGuideRepository } from "@apprentice/core";
import {
  FakeFrameExtractor,
  FakeReasoner,
  FakeSegmenter,
  loadJobFixture,
  type JobFixture,
} from "@apprentice/meta/fake";
import { beforeAll, describe, expect, it } from "vitest";
import { runBuildGuideJob } from "./job.js";
import { MemoryArtifactStore } from "./stage.js";

let fixture: JobFixture;
beforeAll(async () => {
  fixture = await loadJobFixture("ps1_buttons");
});

const payload = {
  guideId: "g1",
  source: { id: "s1", kind: "video", title: "PS1 buttons", location: "ps1.mp4", durationS: 463.8 },
  media: { kind: "provider_file", fileId: "f1" },
};

function deps(guides = new InMemoryGuideRepository()) {
  return {
    guides,
    store: new MemoryArtifactStore(),
    pipeline: {
      reasoner: new FakeReasoner({ fixture }),
      segmenter: new FakeSegmenter(fixture),
      frames: new FakeFrameExtractor("ps1_buttons"),
    },
  };
}

describe("runBuildGuideJob", () => {
  it("saves the built guide as a draft and bumps the version on rebuild", async () => {
    const d = deps();
    await runBuildGuideJob(payload, d);
    expect(await d.guides.get("g1")).toMatchObject({ status: "draft", version: 1 });
    await runBuildGuideJob(payload, d);
    expect((await d.guides.get("g1"))?.version).toBe(2);
  });

  it("never overwrites an approved guide", async () => {
    const d = deps();
    await runBuildGuideJob(payload, d);
    const built = await d.guides.get("g1");
    if (!built) throw new Error("not built");
    await d.guides.put({ ...built, status: "approved", title: "Edited by the author" });
    await runBuildGuideJob(payload, d);
    expect(await d.guides.get("g1")).toMatchObject({
      status: "approved",
      title: "Edited by the author",
    });
  });

  it("rejects an invalid payload before doing any work", async () => {
    const d = deps();
    await expect(runBuildGuideJob({ guideId: "g1" }, d)).rejects.toThrow();
    expect(d.pipeline.reasoner.calls).toEqual([]);
  });
});
