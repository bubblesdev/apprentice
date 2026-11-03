import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { safeFetch, storeStream, type Resolver } from "@apprentice/pipeline";
import { z } from "zod";
import { Candidate, attribution } from "./candidate.js";

/** One downloaded video: where it came from, its licence, the line to credit it with, its hash. */
export const CollectedVideo = Candidate.extend({
  file: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  bytes: z.number().int().positive(),
  attribution: z.string().min(1),
  collectedAt: z.string().datetime(),
});
export type CollectedVideo = z.infer<typeof CollectedVideo>;

export const Manifest = z.object({ version: z.literal(1), videos: z.array(CollectedVideo) });
export type Manifest = z.infer<typeof Manifest>;

export const MANIFEST = "manifest.json";

export async function readManifest(dir: string): Promise<Manifest> {
  const path = join(dir, MANIFEST);
  if (!existsSync(path)) return { version: 1, videos: [] };
  return Manifest.parse(JSON.parse(await readFile(path, "utf8")));
}

export interface CollectOptions {
  dir: string;
  maxBytes: number;
  fetch?: typeof fetch;
  resolve?: Resolver;
  now?: () => Date;
  onSkip?: (c: Candidate, reason: string) => void;
}

/**
 * Downloads each licence-checked candidate once (skipping ones already in the manifest and ones
 * over the size cap), names it by content hash, and records it in `manifest.json` with its
 * attribution. The manifest is written after every file, so an interrupted run keeps its work.
 */
export async function collect(
  candidates: readonly Candidate[],
  opts: CollectOptions,
): Promise<CollectedVideo[]> {
  const manifest = await readManifest(opts.dir);
  const known = new Set(manifest.videos.map((v) => `${v.source}:${v.id}`));
  const added: CollectedVideo[] = [];
  for (const c of candidates) {
    if (known.has(`${c.source}:${c.id}`)) {
      opts.onSkip?.(c, "already collected");
      continue;
    }
    if (c.sizeBytes !== undefined && c.sizeBytes > opts.maxBytes) {
      opts.onSkip?.(c, `larger than ${Math.round(opts.maxBytes / 1e6)} MB`);
      continue;
    }
    try {
      const res = await safeFetch(c.downloadUrl, {
        ...(opts.fetch ? { fetch: opts.fetch } : {}),
        ...(opts.resolve ? { resolve: opts.resolve } : {}),
        timeoutMs: 10 * 60_000,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const stored = await storeStream(res.body, {
        dir: opts.dir,
        maxBytes: opts.maxBytes,
        mime: c.mime,
      });
      const file = basename(stored.path);
      const video = CollectedVideo.parse({
        ...c,
        file,
        sha256: file.split(".")[0],
        bytes: stored.bytes,
        attribution: attribution(c),
        collectedAt: (opts.now?.() ?? new Date()).toISOString(),
      });
      manifest.videos.push(video);
      known.add(`${c.source}:${c.id}`);
      added.push(video);
      await writeFile(join(opts.dir, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
    } catch (error) {
      opts.onSkip?.(c, error instanceof Error ? error.message : String(error));
    }
  }
  return added;
}

/** ATTRIBUTION.md for a collection: one credit line per video, for the repo or the demo credits. */
export function attributionMarkdown(manifest: Manifest): string {
  return [
    "# Attribution",
    "",
    "Videos collected for evaluation. Each is used under the licence shown.",
    "",
    ...manifest.videos.map((v) => `- \`${v.file}\`: ${v.attribution}`),
    "",
  ].join("\n");
}
