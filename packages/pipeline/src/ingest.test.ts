import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IngestError, ingestRemoteVideo, storeStream } from "./ingest.js";
import type { BuildGuidePayload } from "./job.js";

let dir = "";
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "apprentice-ingest-"));
});
afterEach(async () => rm(dir, { recursive: true, force: true }));

const publicDns = async () => ["93.184.216.34"];

const streamOf = (...chunks: number[][]) => new Blob(chunks.map((c) => new Uint8Array(c))).stream();

describe("storeStream", () => {
  it("names files by content, so the same upload lands at the same path", async () => {
    const a = await storeStream(streamOf([1, 2], [3]), { dir, maxBytes: 10, mime: "video/mp4" });
    const b = await storeStream(streamOf([1, 2, 3]), { dir, maxBytes: 10, mime: "video/mp4" });
    expect(a.path).toBe(b.path);
    expect(a.path).toMatch(/[0-9a-f]{64}\.mp4$/);
    expect([...(await readFile(a.path))]).toEqual([1, 2, 3]);
    expect(fileURLToPath(a.url)).toBe(a.path);
  });

  it("rejects files over the size cap and leaves nothing behind", async () => {
    await expect(
      storeStream(streamOf([1, 2, 3]), { dir, maxBytes: 2, mime: "video/mp4" }),
    ).rejects.toBeInstanceOf(IngestError);
    expect(await readdir(dir)).toEqual([]);
  });

  it("rejects an empty file", async () => {
    await expect(storeStream(streamOf(), { dir, maxBytes: 2, mime: "video/mp4" })).rejects.toThrow(
      /empty/,
    );
  });
});

describe("ingestRemoteVideo", () => {
  const payload = (kind: "video" | "video_url", url: string): BuildGuidePayload => ({
    guideId: "g1",
    source: { id: "s1", kind, title: "Job", location: url },
    media: { kind: "url", url },
  });
  const fetchVideo = (calls: string[], mime = "video/mp4"): typeof fetch =>
    (async (input: string | URL | Request) => {
      calls.push(String(input));
      return new Response(new Uint8Array([9, 9, 9]), { headers: { "content-type": mime } });
    }) as typeof fetch;

  it("downloads a direct video link once and points the job at the local file", async () => {
    const calls: string[] = [];
    const opts = { dir, maxBytes: 100, fetch: fetchVideo(calls), resolve: publicDns };
    const first = await ingestRemoteVideo(payload("video_url", "https://example.com/v.mp4"), opts);
    const second = await ingestRemoteVideo(payload("video_url", "https://example.com/v.mp4"), opts);
    expect(calls).toHaveLength(1);
    expect(first.media).toEqual(second.media);
    expect(first.frameSource).toEqual(first.media);
    if (first.media.kind !== "url") throw new Error("expected a url");
    expect(existsSync(fileURLToPath(first.media.url))).toBe(true);
  });

  it("refuses a link that is not a video", async () => {
    const opts = { dir, maxBytes: 100, fetch: fetchVideo([], "text/html"), resolve: publicDns };
    await expect(
      ingestRemoteVideo(payload("video_url", "https://example.com/page"), opts),
    ).rejects.toThrow(/straight at a video/);
  });

  it("refuses links to private addresses", async () => {
    const opts = { dir, maxBytes: 100, fetch: fetchVideo([]), resolve: async () => ["10.0.0.5"] };
    await expect(
      ingestRemoteVideo(payload("video_url", "https://intranet.example/v.mp4"), opts),
    ).rejects.toThrow(/private/);
  });

  it("leaves uploaded and fixture sources alone", async () => {
    const p = payload("video", "fixture://ps1_buttons/source");
    expect(await ingestRemoteVideo(p, { dir, maxBytes: 1 })).toBe(p);
  });
});
