import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { InMemoryMediaStore, type MediaStore } from "@apprentice/core";
import { AwsClient } from "aws4fetch";
import { z } from "zod";

/** Keys are relative paths of letters, digits, dots, dashes and slashes; nothing that climbs out. */
export function assertSafeKey(key: string): void {
  if (!/^[\w.-]+(\/[\w.-]+)*$/.test(key) || key.split("/").some((p) => p === ".." || p === ".")) {
    throw new Error(`Unsafe media key: ${key}`);
  }
}

const Meta = z.object({ mime: z.string() });

/**
 * Media on local disk (a Fly volume in production, `.data/media` in development), so evidence
 * frames and diagrams survive restarts and an API and a worker on one machine share them.
 */
export class FileMediaStore implements MediaStore {
  private readonly root: string;

  constructor(dir: string) {
    this.root = resolve(dir);
  }

  private path(key: string): string {
    assertSafeKey(key);
    const path = resolve(join(this.root, key));
    if (!path.startsWith(this.root + sep)) throw new Error(`Unsafe media key: ${key}`);
    return path;
  }

  async put(key: string, data: Uint8Array, mime: string): Promise<void> {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(`${path}.tmp`, data);
    await writeFile(`${path}.meta.json`, JSON.stringify({ mime }));
    await rename(`${path}.tmp`, path);
  }

  async get(key: string): Promise<{ data: Uint8Array; mime: string } | undefined> {
    const path = this.path(key);
    try {
      const [data, meta] = await Promise.all([
        readFile(path),
        readFile(`${path}.meta.json`, "utf8"),
      ]);
      return { data: new Uint8Array(data), mime: Meta.parse(JSON.parse(meta)).mime };
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
      throw error;
    }
  }
}

export const R2Config = z.object({
  accountId: z.string().min(1),
  bucket: z.string().min(1),
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
});
export type R2Config = z.infer<typeof R2Config>;

/** Media in Cloudflare R2 (ADR 0005) through its S3-compatible API, signed with SigV4. */
export class R2MediaStore implements MediaStore {
  private readonly client: AwsClient;
  private readonly base: string;

  constructor(
    config: R2Config,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.client = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      service: "s3",
      region: "auto",
    });
    this.base = `https://${config.accountId}.r2.cloudflarestorage.com/${encodeURIComponent(config.bucket)}`;
  }

  private url(key: string): string {
    assertSafeKey(key);
    return `${this.base}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }

  /** Signs with SigV4, then sends through the injected fetch. */
  private async send(url: string, init: RequestInit = {}): Promise<Response> {
    return this.fetchImpl(await this.client.sign(url, init));
  }

  async put(key: string, data: Uint8Array, mime: string): Promise<void> {
    const res = await this.send(this.url(key), {
      method: "PUT",
      body: data,
      headers: { "Content-Type": mime },
    });
    if (!res.ok) throw new Error(`R2 put ${key} failed: HTTP ${res.status}`);
  }

  async get(key: string): Promise<{ data: Uint8Array; mime: string } | undefined> {
    const res = await this.send(this.url(key));
    if (res.status === 404) return undefined;
    if (!res.ok) throw new Error(`R2 get ${key} failed: HTTP ${res.status}`);
    return {
      data: new Uint8Array(await res.arrayBuffer()),
      mime: res.headers.get("content-type") ?? "application/octet-stream",
    };
  }
}

export const MediaEnv = z.object({
  /** file: MEDIA_DIR on disk (shared volume); r2: Cloudflare R2; memory: tests only. */
  MEDIA_STORE: z.enum(["file", "r2", "memory"]).default("file"),
  MEDIA_DIR: z.string().min(1).default(".data/media"),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
});
export type MediaEnv = z.infer<typeof MediaEnv>;

export function mediaStoreFromEnv(env: MediaEnv): MediaStore {
  switch (env.MEDIA_STORE) {
    case "memory":
      return new InMemoryMediaStore();
    case "file":
      return new FileMediaStore(env.MEDIA_DIR);
    case "r2":
      return new R2MediaStore(
        R2Config.parse({
          accountId: env.R2_ACCOUNT_ID,
          bucket: env.R2_BUCKET,
          accessKeyId: env.R2_ACCESS_KEY_ID,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        }),
      );
  }
}
