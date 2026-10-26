import { describe, expect, it } from "vitest";
import { extractImages } from "./client.js";
import { FakeIllustrator } from "./fake/fake-illustrator.js";
import { MuseIllustrator } from "./illustrator.js";
import { CostMeter } from "./meter.js";
import { StubMetaApi } from "./testing/stub-api.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64");
const step = {
  title: "Grease the post",
  instruction: "Spread a thin film.",
  parts: ["centre post", "grease"],
};

describe("extractImages", () => {
  it.each([
    [
      "an image generation call",
      [{ type: "image_generation_call", result: PNG, output_format: "png" }],
      { mime: "image/png", base64: PNG },
    ],
    [
      "output_image with base64",
      [{ content: [{ type: "output_image", b64_json: PNG }] }],
      { base64: PNG },
    ],
    [
      "output_image with a url object",
      [{ content: [{ type: "output_image", image_url: { url: "https://cdn/x.png" } }] }],
      { url: "https://cdn/x.png" },
    ],
    [
      "a data URL",
      [{ content: [{ type: "output_image", image_url: `data:image/webp;base64,${PNG}` }] }],
      { url: `data:image/webp;base64,${PNG}` },
    ],
  ])("reads %s", (_label, output, expected) => {
    expect(extractImages(output)[0]).toEqual(expected);
  });

  it("ignores text-only output", () => {
    expect(extractImages([{ content: [{ type: "output_text", text: "hi" }] }])).toEqual([]);
  });
});

describe("MuseIllustrator", () => {
  it("prompts with the step and its latest reference frame, meters one image and returns bytes", async () => {
    const api = new StubMetaApi([{ text: "", images: [{ mime: "image/png", base64: PNG }] }]);
    const meter = new CostMeter({ scope: { kind: "guide", id: "g" } });
    const frame = { kind: "url", url: "https://cdn/frame.jpg" } as const;
    const out = await new MuseIllustrator({ api, meter }).diagram({
      ...step,
      reference: [frame, frame],
    });
    expect(out.mime).toBe("image/png");
    expect([...out.data]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const body = api.bodies[0] as {
      model: string;
      input: { content: { type: string; text?: string }[] }[];
    };
    expect(body.model).toBe("muse-image-1.0");
    expect(body.input[0]?.content.map((c) => c.type)).toEqual(["input_text", "input_image"]);
    expect(body.input[0]?.content[0]?.text).toMatch(/centre post, grease/);
    expect(meter.spentUsd).toBeCloseTo(0.01);
  });

  it("downloads an image returned by https URL", async () => {
    const api = new StubMetaApi([{ text: "", images: [{ url: "https://cdn/x.png" }] }]);
    const fetchImpl = (async () =>
      new Response(new Uint8Array([1, 2]), {
        headers: { "content-type": "image/webp" },
      })) as typeof fetch;
    const out = await new MuseIllustrator({ api, fetch: fetchImpl }).diagram({
      ...step,
      reference: [],
    });
    expect(out).toMatchObject({ mime: "image/webp" });
  });

  it("fails clearly when no image comes back", async () => {
    const api = new StubMetaApi([{ text: "I can't draw that." }]);
    await expect(new MuseIllustrator({ api }).diagram({ ...step, reference: [] })).rejects.toThrow(
      /no image/,
    );
  });
});

describe("FakeIllustrator", () => {
  it("returns an SVG that says it is a placeholder, with escaped text", async () => {
    const out = await new FakeIllustrator().diagram({ ...step, title: "Tighten <screws> & check" });
    const svg = new TextDecoder().decode(out.data);
    expect(out.mime).toBe("image/svg+xml");
    expect(svg).toContain("MUSE IMAGE NOT CALLED");
    expect(svg).toContain("&#60;screws&#62; &#38; check");
  });
});
