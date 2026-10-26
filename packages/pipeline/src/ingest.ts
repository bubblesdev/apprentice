import { createHash, randomUUID } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { BuildGuidePayload } from "./job.js";
import { safeFetch, type Resolver } from "./safe-fetch.js";

export class IngestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IngestError";
  }
}

const EXTENSIONS: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "text/plain": "txt",
  "text/markdown": "md",
  "application/pdf": "pdf",
};

export function extensionFor(mime: string): string {
  return EXTENSIONS[mime.split(";")[0]?.trim() ?? ""] ?? "bin";
}

/**
 * Streams bytes to `dir`, enforcing a size cap, and names the file by the SHA-256 of its content.
 * The same video uploaded twice lands at the same path, so pipeline stages keyed on it are reused.
 */
export async function storeStream(
  stream: ReadableStream<Uint8Array>,
  opts: { dir: string; maxBytes: number; mime: string },
): Promise<{ path: string; url: string; bytes: number }> {
  await mkdir(opts.dir, { recursive: true });
  const tmp = join(opts.dir, `.${randomUUID()}.part`);
  const hash = createHash("sha256");
  const out = createWriteStream(tmp);
  let bytes = 0;
  try {
    for await (const chunk of stream) {
      bytes += chunk.byteLength;
      if (bytes > opts.maxBytes)
        throw new IngestError(`File is larger than ${Math.round(opts.maxBytes / 1e6)} MB`);
      hash.update(chunk);
      if (!out.write(chunk))
        await new Promise<void>((resolve) => out.once("drain", () => resolve()));
    }
    await new Promise<void>((resolve, reject) =>
      out.end((error?: Error | null) => (error ? reject(error) : resolve())),
    );
    if (bytes === 0) throw new IngestError("The file is empty");
    const path = join(opts.dir, `${hash.digest("hex")}.${extensionFor(opts.mime)}`);
    await rename(tmp, path);
    return { path, url: pathToFileURL(path).href, bytes };
  } catch (error) {
    out.destroy();
    await rm(tmp, { force: true });
    throw error;
  }
}

export interface RemoteVideoOptions {
  dir: string;
  maxBytes: number;
  fetch?: typeof fetch;
  resolve?: Resolver;
}

/**
 * For a direct video link, downloads the video once (named by a hash of the URL) and points the
 * job at the local file, which the models receive by upload and ffmpeg reads frames from.
 * Other payloads pass through unchanged.
 */
export async function ingestRemoteVideo(
  payload: BuildGuidePayload,
  opts: RemoteVideoOptions,
): Promise<BuildGuidePayload> {
  const { media, source } = payload;
  if (source.kind !== "video_url" || media.kind !== "url" || !/^https?:\/\//i.test(media.url))
    return payload;
  const existing = ["mp4", "mov", "webm"]
    .map((ext) =>
      join(opts.dir, `url-${createHash("sha256").update(media.url).digest("hex")}.${ext}`),
    )
    .find((p) => existsSync(p));
  let path = existing;
  if (!path) {
    const res = await safeFetch(media.url, opts);
    const mime = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    if (!res.ok || !res.body)
      throw new IngestError(`Could not download the video (HTTP ${res.status})`);
    if (!mime.startsWith("video/"))
      throw new IngestError("The link does not point straight at a video file");
    const stored = await storeStream(res.body, { dir: opts.dir, maxBytes: opts.maxBytes, mime });
    path = join(
      opts.dir,
      `url-${createHash("sha256").update(media.url).digest("hex")}.${extensionFor(mime)}`,
    );
    await rename(stored.path, path);
  }
  const local = {
    kind: "url" as const,
    url: pathToFileURL(path).href,
    mime: media.mime ?? "video/mp4",
  };
  return { ...payload, media: local, frameSource: local };
}
