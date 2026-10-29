import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { FfmpegFrameExtractor, localPath } from "./ffmpeg.js";

function hasFfmpeg(): boolean {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe("localPath", () => {
  it("accepts only file: URLs", () => {
    expect(localPath({ kind: "url", url: "file:///tmp/a.mp4" })).toBe("/tmp/a.mp4");
    expect(() => localPath({ kind: "provider_file", fileId: "f" })).toThrow(/file: URL/);
  });
});

describe.runIf(hasFfmpeg())("FfmpegFrameExtractor", () => {
  const dir = mkdtempSync(join(tmpdir(), "apprentice-ffmpeg-"));
  const video = join(dir, "test.mp4");
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("extracts a JPEG frame from a generated test clip", async () => {
    execFileSync("ffmpeg", [
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc=duration=2:size=320x240:rate=10",
      video,
    ]);
    const frame = await new FfmpegFrameExtractor().frameAt(
      { kind: "url", url: pathToFileURL(video).href },
      1,
    );
    expect(frame.kind).toBe("bytes");
    if (frame.kind !== "bytes") return;
    expect([...frame.data.slice(0, 2)]).toEqual([0xff, 0xd8]);
  });

  it("fails clearly for a missing file", async () => {
    const missing = { kind: "url", url: pathToFileURL(join(dir, "nope.mp4")).href } as const;
    await expect(new FfmpegFrameExtractor().frameAt(missing, 1)).rejects.toThrow(
      /could not extract/,
    );
  });
});
