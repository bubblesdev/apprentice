import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { FilesApi, ResponseResult, ResponsesApi } from "./client.js";

/** Key/value store for recorded model responses. Values are JSON. */
export interface ResponseCache {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

/** JSON with object keys sorted, so equal requests hash equally whatever their key order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Cache key for a Responses request. The API key is a header, never part of the body. */
export function responseKey(body: Record<string, unknown>): string {
  return `responses-${sha256(canonicalJson(body))}`;
}

export function fileKey(data: Uint8Array, mime: string): string {
  return `file-${sha256(data)}-${sha256(mime).slice(0, 8)}`;
}

export class MemoryResponseCache implements ResponseCache {
  private readonly entries = new Map<string, unknown>();

  async get(key: string): Promise<unknown> {
    return this.entries.get(key);
  }

  async set(key: string, value: unknown): Promise<void> {
    this.entries.set(key, value);
  }

  get size(): number {
    return this.entries.size;
  }
}

/**
 * One JSON file per key under `dir`, sharded by the first two hex characters. Writes go to a
 * temporary file first so an interrupted run never leaves a half-written entry.
 */
export class FileResponseCache implements ResponseCache {
  constructor(private readonly dir: string) {}

  private path(key: string): string {
    const hash = key.slice(key.indexOf("-") + 1);
    return join(this.dir, hash.slice(0, 2), `${key}.json`);
  }

  async get(key: string): Promise<unknown> {
    try {
      return JSON.parse(await readFile(this.path(key), "utf8"));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
      throw error;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    await writeFile(tmp, `${JSON.stringify(value, null, 1)}\n`);
    await rename(tmp, path);
  }
}

/** A request missed the cache and no live client is configured (replay mode). */
export class CacheMissError extends Error {
  constructor(readonly key: string) {
    super(`No recorded response for ${key} and no live Meta client configured`);
    this.name = "CacheMissError";
  }
}

const CachedResponse = z.object({
  model: z.string().optional(),
  text: z.string(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  recordedAt: z.string(),
});
const CachedFile = z.object({ fileId: z.string(), recordedAt: z.string() });

/**
 * Wraps a live client so each distinct request is paid for once: the first call is recorded,
 * later identical calls (in this process or a later run) replay the recording. Identical
 * requests in flight at the same time share one call. With no live client it only replays.
 */
export class CachedMetaApi implements ResponsesApi, FilesApi {
  private readonly inFlight = new Map<string, Promise<ResponseResult>>();

  constructor(
    private readonly cache: ResponseCache,
    private readonly live?: ResponsesApi & FilesApi,
  ) {}

  createResponse(body: Record<string, unknown>): Promise<ResponseResult> {
    const key = responseKey(body);
    const pending = this.inFlight.get(key);
    if (pending) return pending.then((r) => ({ ...r, cached: true }));
    const call = this.lookupOrCall(key, body).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, call);
    return call;
  }

  private async lookupOrCall(key: string, body: Record<string, unknown>): Promise<ResponseResult> {
    const hit = CachedResponse.safeParse(await this.cache.get(key));
    if (hit.success) {
      const { text, inputTokens, outputTokens } = hit.data;
      return { text, inputTokens, outputTokens, cached: true };
    }
    if (!this.live) throw new CacheMissError(key);
    const result = await this.live.createResponse(body);
    await this.cache.set(key, {
      model: typeof body.model === "string" ? body.model : undefined,
      text: result.text,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      recordedAt: new Date().toISOString(),
    });
    return { ...result, cached: false };
  }

  async uploadFile(data: Uint8Array, filename: string, mime: string): Promise<string> {
    const key = fileKey(data, mime);
    const hit = CachedFile.safeParse(await this.cache.get(key));
    if (hit.success) return hit.data.fileId;
    if (!this.live) throw new CacheMissError(key);
    const fileId = await this.live.uploadFile(data, filename, mime);
    await this.cache.set(key, { fileId, recordedAt: new Date().toISOString() });
    return fileId;
  }
}
