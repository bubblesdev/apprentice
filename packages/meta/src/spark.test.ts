import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { ModelOutputError, UnsupportedMediaError } from "./errors.js";
import { CostMeter } from "./meter.js";
import { SparkReasoner } from "./spark.js";
import { StubMetaApi } from "./testing/stub-api.js";

const step = {
  title: "Remove the Power cap",
  instruction: "Press the clips.",
  doneWhen: "Cap out, socket empty.",
};
const jpeg = { kind: "bytes", mime: "image/jpeg", data: new Uint8Array([255, 216, 255]) } as const;

function contentOf(
  body: Record<string, unknown> | undefined,
): { type: string; [k: string]: unknown }[] {
  const input = body?.input as { content: { type: string }[] }[] | undefined;
  return input?.[0]?.content ?? [];
}

describe("SparkReasoner.draftSteps", () => {
  it("uploads video bytes, sends the video prompt and maps steps in time order", async () => {
    const api = new StubMetaApi([
      {
        text:
          'Here you go:\n{"steps":[' +
          '{"start_s":30,"end_s":50,"title":"Second","parts_and_tools":["cap"],"visible_check":"Cap out","warning":""},' +
          '{"start_s":0,"end_s":30,"title":"First","instruction":"Unplug it.","visible_check":"Unplugged","safety":"caution","warning":"Unplug first"}]}',
      },
    ]);
    const reasoner = new SparkReasoner({ api, files: api });
    const drafts = await reasoner.draftSteps({
      kind: "bytes",
      mime: "video/mp4",
      data: new Uint8Array(8),
    });
    expect(api.uploads).toEqual([{ filename: "video.mp4", mime: "video/mp4", bytes: 8 }]);
    expect(contentOf(api.bodies[0]).map((c) => c.type)).toEqual(["input_text", "input_video"]);
    expect(drafts).toEqual([
      {
        title: "First",
        instruction: "Unplug it.",
        startS: 0,
        endS: 30,
        parts: [],
        doneWhen: "Unplugged",
        warning: "Unplug first",
        safety: "caution",
      },
      {
        title: "Second",
        instruction: "Second",
        startS: 30,
        endS: 50,
        parts: ["cap"],
        doneWhen: "Cap out",
      },
    ]);
  });

  it("uploads a local file: video before drafting", async () => {
    const dir = await mkdtemp(join(tmpdir(), "apprentice-video-"));
    const path = join(dir, "job.mp4");
    await writeFile(path, new Uint8Array([0, 0, 0, 24]));
    const api = new StubMetaApi([
      { text: '{"steps":[{"start_s":0,"end_s":5,"title":"Open","visible_check":"Lid open"}]}' },
    ]);
    await new SparkReasoner({ api, files: api }).draftSteps({
      kind: "url",
      url: pathToFileURL(path).href,
    });
    expect(api.uploads).toEqual([{ filename: "video.mp4", mime: "video/mp4", bytes: 4 }]);
    await rm(dir, { recursive: true, force: true });
  });

  it("drafts from document text without sending media", async () => {
    const api = new StubMetaApi([
      { text: '{"steps":[{"start_s":0,"end_s":0,"title":"Open","visible_check":"Lid open"}]}' },
    ]);
    await new SparkReasoner({ api }).draftSteps(
      { kind: "url", url: "https://example.com/manual" },
      { documentText: "1. Open the lid." },
    );
    const content = contentOf(api.bodies[0]);
    expect(content).toHaveLength(1);
    expect(String(content[0]?.text)).toContain("1. Open the lid.");
  });

  it("rejects video URLs, which ingest must download first", async () => {
    const api = new StubMetaApi([{ text: "{}" }]);
    await expect(
      new SparkReasoner({ api }).draftSteps({ kind: "url", url: "https://x/v.mp4" }),
    ).rejects.toBeInstanceOf(UnsupportedMediaError);
  });

  it("throws ModelOutputError when the reply has no steps", async () => {
    const api = new StubMetaApi([{ text: '{"steps":[]}' }]);
    await expect(
      new SparkReasoner({ api }).draftSteps({ kind: "provider_file", fileId: "f" }),
    ).rejects.toBeInstanceOf(ModelOutputError);
  });
});

describe("SparkReasoner.draftSteps check_view", () => {
  it("keeps a requested view as showMe and drops an empty one", async () => {
    const api = new StubMetaApi([
      {
        text:
          '{"steps":[{"start_s":0,"end_s":5,"title":"Remove screws","visible_check":"No screws",' +
          '"check_view":"Turn it over so I can see the bottom"},' +
          '{"start_s":5,"end_s":9,"title":"Lift cover","visible_check":"Cover off","check_view":""}]}',
      },
    ]);
    const drafts = await new SparkReasoner({ api }).draftSteps(
      { kind: "url", url: "https://cdn/v.mp4", mime: "video/mp4" },
      { documentText: "x" },
    );
    expect(drafts.map((d) => d.showMe)).toEqual([
      "Turn it over so I can see the bottom",
      undefined,
    ]);
  });
});

describe("SparkReasoner.judgeStep", () => {
  it("sends the strict-instructor prompt with reference frames before live frames", async () => {
    const api = new StubMetaApi([
      { text: '{"verdict":"not_yet","confidence":0.9,"evidence":"Power cap still seated."}' },
    ]);
    const reasoner = new SparkReasoner({ api });
    const verdict = await reasoner.judgeStep({
      step,
      reference: [jpeg, jpeg, { kind: "url", url: "https://cdn/ref.jpg" }],
      live: [jpeg],
    });
    expect(verdict).toEqual({
      kind: "not_yet",
      confidence: 0.9,
      sentence: "Power cap still seated.",
    });
    const content = contentOf(api.bodies[0]);
    expect(String(content[0]?.text)).toMatch(
      /strict workshop instructor[\s\S]*first 3 images[\s\S]*last 1 images/,
    );
    expect(String(content[0]?.text)).toMatch(/which way a part faces[\s\S]*not enough/);
    expect(content[1]).toEqual({ type: "input_image", image_url: "data:image/jpeg;base64,/9j/" });
    expect(content[3]).toEqual({ type: "input_image", image_url: "https://cdn/ref.jpg" });
    expect(api.bodies[0]?.model).toBe("muse-spark-1.3");
  });

  it("sends a reasoning level on step checks only, and only when one is set", async () => {
    const reply = '{"verdict":"done","confidence":0.95,"evidence":"Socket empty."}';
    const api = new StubMetaApi([{ text: reply }, { text: "Unplug it first." }, { text: reply }]);
    const low = new SparkReasoner({ api, judgeEffort: "low" });
    await low.judgeStep({ step, reference: [jpeg], live: [jpeg] });
    await low.answer({ step, question: "What first?", live: [] });
    await new SparkReasoner({ api }).judgeStep({ step, reference: [jpeg], live: [jpeg] });
    expect(api.bodies.map((b) => b?.reasoning)).toEqual([{ effort: "low" }, undefined, undefined]);
  });

  it("meters tokens, and records a cache hit at zero cost", async () => {
    const reply = '{"verdict":"done","confidence":0.95,"evidence":"Socket empty."}';
    const api = new StubMetaApi([{ text: reply }, { text: reply, cached: true }]);
    const meter = new CostMeter({ scope: { kind: "session", id: "s1" } });
    const reasoner = new SparkReasoner({ api, meter });
    await reasoner.judgeStep({ step, reference: [jpeg], live: [jpeg] });
    await reasoner.judgeStep({ step, reference: [jpeg], live: [jpeg] });
    expect(meter.events.map((e) => [e.operation, e.cached])).toEqual([
      ["judge_step", false],
      ["judge_step", true],
    ]);
    expect(meter.spentUsd).toBeCloseTo((1000 * 1.25 + 100 * 4.25) / 1e6);
  });

  it("refuses to call once the budget is spent", async () => {
    const api = new StubMetaApi([{ text: "{}" }]);
    const meter = new CostMeter({ scope: { kind: "session", id: "s1" }, capUsd: 0 });
    await expect(
      new SparkReasoner({ api, meter }).judgeStep({ step, reference: [], live: [] }),
    ).rejects.toThrow(/Budget/);
    expect(api.bodies).toHaveLength(0);
  });

  it("rejects verdicts outside the vocabulary", async () => {
    const api = new StubMetaApi([
      { text: '{"verdict":"maybe","confidence":0.5,"evidence":"Hard to say."}' },
    ]);
    await expect(
      new SparkReasoner({ api }).judgeStep({ step, reference: [], live: [] }),
    ).rejects.toBeInstanceOf(ModelOutputError);
  });
});

describe("SparkReasoner.refineBoundary", () => {
  it("labels each frame with its time and snaps the answer to a frame that was shown", async () => {
    const api = new StubMetaApi([
      { text: '{"end_s":61.2,"confidence":0.8,"evidence":"Cap is out at 61 s."}' },
    ]);
    const estimate = await new SparkReasoner({ api }).refineBoundary({
      step,
      frames: [62, 58, 60].map((t) => ({ t, media: jpeg })),
    });
    expect(estimate).toEqual({ endS: 62, confidence: 0.8, sentence: "Cap is out at 61 s." });
    const texts = contentOf(api.bodies[0])
      .filter((c) => c.type === "input_text")
      .map((c) => String(c.text));
    expect(texts.slice(1)).toEqual(["t=58s", "t=60s", "t=62s"]);
  });

  it("passes through 'not visible' and skips the call when there are no frames", async () => {
    const api = new StubMetaApi([
      { text: '{"end_s":null,"confidence":0.3,"evidence":"Still greasing."}' },
    ]);
    const reasoner = new SparkReasoner({ api });
    expect(
      (await reasoner.refineBoundary({ step, frames: [{ t: 1, media: jpeg }] })).endS,
    ).toBeNull();
    expect((await reasoner.refineBoundary({ step, frames: [] })).confidence).toBe(0);
    expect(api.bodies).toHaveLength(1);
  });
});
