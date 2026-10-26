import { describe, expect, it } from "vitest";
import { CostMeter } from "./meter.js";
import { parseSamImageOutput } from "./sam.js";
import { SamSegmenter } from "./sam-segmenter.js";
import { StubMetaApi } from "./testing/stub-api.js";

const BOX = "<|box;x1=10;y1=20;x2=110;y2=220;w=1280;h=720;c=0.91|><|mask;x=0;y=0;data=2,2,!abc|>";

describe("SamSegmenter", () => {
  it("tracks a concept in a video clip and meters the frames it was told about", async () => {
    const api = new StubMetaApi([{ text: `<0f>0${BOX}\n<7f>0${BOX}` }]);
    const meter = new CostMeter({ scope: { kind: "guide", id: "g1" } });
    const segmenter = new SamSegmenter({ api, meter });
    const frames = await segmenter.trackInVideo(
      { kind: "provider_file", fileId: "f1" },
      "screwdriver",
      {
        frameCount: 200,
      },
    );
    expect([...frames.keys()]).toEqual([0, 7]);
    expect(api.bodies[0]).toMatchObject({
      model: "sam-3.1",
      metadata: { mask_encoding: "one_bit", include_confidence: "true" },
    });
    expect(meter.events[0]?.usage).toEqual({
      unit: "sam_video_frames",
      frames: 200,
      estimated: false,
    });
    expect(meter.spentUsd).toBeCloseTo(0.04);
  });

  it("estimates frames from the output when the count is unknown", async () => {
    const api = new StubMetaApi([{ text: `<99f>0${BOX}` }]);
    const meter = new CostMeter({ scope: { kind: "guide", id: "g1" } });
    await new SamSegmenter({ api, meter }).trackInVideo(
      { kind: "provider_file", fileId: "f1" },
      "cap",
    );
    expect(meter.events[0]?.usage).toEqual({
      unit: "sam_video_frames",
      frames: 100,
      estimated: true,
    });
  });

  it("finds a concept in an image", async () => {
    const api = new StubMetaApi([{ text: `0${BOX},1${BOX}` }]);
    const meter = new CostMeter({ scope: { kind: "session", id: "s1" } });
    const found = await new SamSegmenter({ api, meter }).findInImage(
      { kind: "bytes", mime: "image/jpeg", data: new Uint8Array([1]) },
      "Power cap",
    );
    expect(found.map((d) => d.objectId)).toEqual([0, 1]);
    expect(meter.spentUsd).toBeCloseTo(0.0025);
  });
});

describe("parseSamImageOutput", () => {
  it("accepts output with or without a frame prefix", () => {
    expect(parseSamImageOutput(`<0f>3${BOX}`)[0]?.objectId).toBe(3);
    expect(parseSamImageOutput(`3${BOX}`)[0]?.confidence).toBe(0.91);
    expect(parseSamImageOutput("")).toEqual([]);
  });
});
