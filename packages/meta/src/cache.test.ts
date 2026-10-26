import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalJson } from "@apprentice/core";
import { afterEach, describe, expect, it } from "vitest";
import {
  CacheMissError,
  CachedMetaApi,
  FileResponseCache,
  MemoryResponseCache,
  responseKey,
} from "./cache.js";
import { StubMetaApi } from "./testing/stub-api.js";

describe("canonicalJson and responseKey", () => {
  it("ignores key order and undefined values", () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }], e: undefined })).toBe(
      '{"a":[{"c":3,"d":2}],"b":1}',
    );
    expect(responseKey({ model: "m", input: [1] })).toBe(responseKey({ input: [1], model: "m" }));
  });

  it("changes when any part of the request changes", () => {
    expect(responseKey({ model: "m", input: [1] })).not.toBe(
      responseKey({ model: "m", input: [2] }),
    );
  });
});

describe("CachedMetaApi", () => {
  it("pays for a request once and replays it afterwards", async () => {
    const live = new StubMetaApi([{ text: "first" }, { text: "second" }]);
    const api = new CachedMetaApi(new MemoryResponseCache(), live);
    const body = { model: "muse-spark-1.3", input: ["x"] };
    const a = await api.createResponse(body);
    const b = await api.createResponse({ input: ["x"], model: "muse-spark-1.3" });
    expect(a).toMatchObject({ text: "first", cached: false });
    expect(b).toMatchObject({ text: "first", cached: true, inputTokens: 1000 });
    expect(live.bodies).toHaveLength(1);
  });

  it("shares one call between identical requests in flight", async () => {
    const live = new StubMetaApi([{ text: "only" }]);
    const api = new CachedMetaApi(new MemoryResponseCache(), live);
    const [a, b] = await Promise.all([api.createResponse({ q: 1 }), api.createResponse({ q: 1 })]);
    expect(live.bodies).toHaveLength(1);
    expect([a.cached, b.cached]).toEqual([false, true]);
  });

  it("caches uploads by content", async () => {
    const live = new StubMetaApi([{ text: "" }]);
    const api = new CachedMetaApi(new MemoryResponseCache(), live);
    const bytes = new Uint8Array([1, 2, 3]);
    expect(await api.uploadFile(bytes, "a.mp4", "video/mp4")).toBe("file-1");
    expect(await api.uploadFile(bytes, "b.mp4", "video/mp4")).toBe("file-1");
    expect(live.uploads).toHaveLength(1);
  });

  it("fails on a miss in replay mode instead of calling out", async () => {
    const api = new CachedMetaApi(new MemoryResponseCache());
    await expect(api.createResponse({ q: 1 })).rejects.toBeInstanceOf(CacheMissError);
  });

  it("ignores a corrupt entry and re-records it", async () => {
    const cache = new MemoryResponseCache();
    await cache.set(responseKey({ q: 1 }), { nonsense: true });
    const live = new StubMetaApi([{ text: "fresh" }]);
    const result = await new CachedMetaApi(cache, live).createResponse({ q: 1 });
    expect(result.text).toBe("fresh");
  });
});

describe("FileResponseCache", () => {
  let dir = "";
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("persists across instances, so a later run replays an earlier call", async () => {
    dir = await mkdtemp(join(tmpdir(), "apprentice-cache-"));
    const live = new StubMetaApi([{ text: "recorded" }]);
    await new CachedMetaApi(new FileResponseCache(dir), live).createResponse({ q: 1 });
    const replay = await new CachedMetaApi(new FileResponseCache(dir)).createResponse({ q: 1 });
    expect(replay).toMatchObject({ text: "recorded", cached: true });
  });

  it("returns undefined for an unknown key", async () => {
    dir = await mkdtemp(join(tmpdir(), "apprentice-cache-"));
    expect(await new FileResponseCache(dir).get("responses-abcdef")).toBeUndefined();
  });
});
