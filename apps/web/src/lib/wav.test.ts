import { describe, expect, it } from "vitest";
import { encodeWav, toBase64 } from "./wav";

describe("encodeWav", () => {
  it("writes a mono 16-bit PCM header and clamps samples", () => {
    const wav = encodeWav(new Float32Array([0, 1, -1, 2]), 16000);
    const v = new DataView(wav.buffer);
    expect(new TextDecoder().decode(wav.subarray(0, 4))).toBe("RIFF");
    expect(new TextDecoder().decode(wav.subarray(8, 12))).toBe("WAVE");
    expect(v.getUint16(22, true)).toBe(1);
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(8);
    expect([
      v.getInt16(44, true),
      v.getInt16(46, true),
      v.getInt16(48, true),
      v.getInt16(50, true),
    ]).toEqual([0, 32767, -32768, 32767]);
  });

  it("base64-encodes large buffers in chunks", () => {
    const bytes = new Uint8Array(100_000).fill(65);
    expect(atob(toBase64(bytes)).length).toBe(100_000);
  });
});
