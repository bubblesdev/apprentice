import { describe, expect, it } from "vitest";
import { CachedMetaApi, MemoryResponseCache } from "./cache.js";
import { CostMeter } from "./meter.js";
import { SparkReasoner } from "./spark.js";
import { StubMetaApi } from "./testing/stub-api.js";
import { MuseTranscriber, wavDurationS } from "./transcriber.js";

/** A silent mono 16-bit PCM WAV of the given length. */
function wav(seconds: number, sampleRate = 16000): Uint8Array {
  const dataBytes = Math.round(seconds * sampleRate) * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const text = (at: number, s: string) =>
    [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF");
  v.setUint32(4, 36 + dataBytes, true);
  text(8, "WAVE");
  text(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, "data");
  v.setUint32(40, dataBytes, true);
  return new Uint8Array(buf);
}

describe("wavDurationS", () => {
  it("reads the duration from the header", () => {
    expect(wavDurationS(wav(2.5))).toBeCloseTo(2.5);
    expect(wavDurationS(wav(1, 24000))).toBeCloseTo(1);
    expect(wavDurationS(new Uint8Array(10))).toBeUndefined();
    expect(wavDurationS(new TextEncoder().encode("x".repeat(64)))).toBeUndefined();
  });
});

describe("MuseTranscriber", () => {
  it("sends WAV audio to Voice Transcribe and meters seconds of audio", async () => {
    const api = new StubMetaApi([{ text: "" }]);
    api.transcript = "  where does the spring go?  ";
    const meter = new CostMeter({ scope: { kind: "session", id: "s" } });
    const out = await new MuseTranscriber({ api, meter }).transcribe({
      kind: "bytes",
      mime: "audio/wav",
      data: wav(4),
    });
    expect(out.text).toBe("where does the spring go?");
    expect(api.transcriptions).toEqual([
      { model: "muse-voice-transcribe-1.0", mime: "audio/wav", bytes: 44 + 128000 },
    ]);
    expect(meter.events[0]?.usage).toEqual({ unit: "audio_seconds", seconds: 4 });
  });

  it("refuses audio that is not WAV, before calling out", async () => {
    const api = new StubMetaApi([{ text: "" }]);
    await expect(
      new MuseTranscriber({ api }).transcribe({
        kind: "bytes",
        mime: "audio/webm",
        data: new Uint8Array(100),
      }),
    ).rejects.toThrow(/WAV/);
    expect(api.transcriptions).toEqual([]);
  });

  it("is cached by audio content like any other call", async () => {
    const live = new StubMetaApi([{ text: "" }]);
    live.transcript = "hello";
    const api = new CachedMetaApi(new MemoryResponseCache(), live);
    const t = new MuseTranscriber({ api });
    await t.transcribe({ kind: "bytes", mime: "audio/wav", data: wav(1) });
    await t.transcribe({ kind: "bytes", mime: "audio/wav", data: wav(1) });
    expect(live.transcriptions).toHaveLength(1);
  });
});

describe("SparkReasoner.answer", () => {
  it("answers about the current step, looking at the latest frame", async () => {
    const api = new StubMetaApi([{ text: " Hook it over the small post on the left. " }]);
    const out = await new SparkReasoner({ api }).answer({
      step: {
        title: "Refit the slider",
        instruction: "Hook the spring.",
        doneWhen: "Spring hooked.",
      },
      question: "Where does the spring go?",
      live: [
        { kind: "url", url: "https://cdn/a.jpg" },
        { kind: "url", url: "https://cdn/b.jpg" },
      ],
    });
    expect(out.answer).toBe("Hook it over the small post on the left.");
    const content = (
      api.bodies[0] as {
        input: { content: { type: string; image_url?: string; text?: string }[] }[];
      }
    ).input[0]?.content;
    expect(content?.map((c) => c.type)).toEqual(["input_text", "input_image"]);
    expect(content?.[1]?.image_url).toBe("https://cdn/b.jpg");
    expect(content?.[0]?.text).toContain('"Where does the spring go?"');
  });
});
