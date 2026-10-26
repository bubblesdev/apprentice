import { describe, expect, it } from "vitest";
import { parseSamOutput } from "./sam.js";

describe("parseSamOutput", () => {
  it("parses frames, ids, boxes and confidence, keyed by frame index", () => {
    const text = [
      "<12f>0<|box;x1=10;y1=20;x2=110;y2=220;w=1280;h=720;c=0.91|><|mask;x=0;y=0;data=2,2,!abc|>,3<|box;x1=1;y1=2;x2=3;y2=4;w=1280;h=720|><|mask;x=0;y=0;data=1,1,!a|>",
      "<4f>0<|box;x1=11;y1=21;x2=111;y2=221;w=1280;h=720;c=0.88|><|mask;x=0;y=0;data=2,2,!abc|>",
    ].join("\n");
    const frames = parseSamOutput(text);
    expect([...frames.keys()]).toEqual([12, 4]);
    expect(frames.get(12)).toEqual([
      { objectId: 0, box: { x1: 10, y1: 20, x2: 110, y2: 220, w: 1280, h: 720 }, confidence: 0.91 },
      { objectId: 3, box: { x1: 1, y1: 2, x2: 3, y2: 4, w: 1280, h: 720 } },
    ]);
  });

  it("returns an empty map for zero matches", () => {
    expect(parseSamOutput("").size).toBe(0);
  });

  it("skips records with incomplete boxes", () => {
    const frames = parseSamOutput("<0f>0<|box;x1=1;y1=2;w=10;h=10|>");
    expect(frames.get(0)).toEqual([]);
  });
});
