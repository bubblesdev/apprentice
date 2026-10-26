import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { FrameExtractor, Media } from "@apprentice/core";

export interface FfmpegOptions {
  /** Output height in pixels; frames sent to models stay small (spike 2 used 360). */
  height?: number;
  ffmpegPath?: string;
}

/** Local file path for a `file:` URL media; other media cannot be read by ffmpeg here. */
export function localPath(video: Media): string {
  if (video.kind === "url" && video.url.startsWith("file:")) return fileURLToPath(video.url);
  throw new Error("FfmpegFrameExtractor needs a file: URL to a local video");
}

/** Extracts one JPEG frame at a time with ffmpeg (seeking before the input, as in the spikes). */
export class FfmpegFrameExtractor implements FrameExtractor {
  constructor(private readonly options: FfmpegOptions = {}) {}

  frameAt(video: Media, t: number): Promise<Media> {
    const args = [
      "-loglevel",
      "error",
      "-ss",
      t.toFixed(2),
      "-i",
      localPath(video),
      "-frames:v",
      "1",
      "-vf",
      `scale=-2:${this.options.height ?? 360}`,
      "-q:v",
      "4",
      "-f",
      "image2pipe",
      "-c:v",
      "mjpeg",
      "pipe:1",
    ];
    return new Promise((resolve, reject) => {
      const proc = spawn(this.options.ffmpegPath ?? "ffmpeg", args);
      const chunks: Buffer[] = [];
      let stderr = "";
      proc.stdout.on("data", (c: Buffer) => chunks.push(c));
      proc.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
      proc.on("error", reject);
      proc.on("close", (code) => {
        const data = Buffer.concat(chunks);
        if (code !== 0 || data.length === 0) {
          reject(
            new Error(
              `ffmpeg could not extract a frame at ${t}s: ${stderr.trim() || `exit ${code}`}`,
            ),
          );
          return;
        }
        resolve({ kind: "bytes", mime: "image/jpeg", data: new Uint8Array(data) });
      });
    });
  }
}
