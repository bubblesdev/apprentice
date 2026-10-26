import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BuildStatus, CoachUpdate } from "@apprentice/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApiEnv, createRuntime } from "./runtime.js";

let dir = "";
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "apprentice-uploads-"));
});
afterEach(async () => rm(dir, { recursive: true, force: true }));

async function runtime(env: Record<string, string> = {}) {
  let n = 0;
  const rt = await createRuntime(
    ApiEnv.parse({ APPRENTICE_ADAPTERS: "fake", UPLOAD_DIR: dir, UPLOAD_MAX_MB: "0.001", ...env }),
    { newId: () => `ing-${++n}` },
  );
  await rt.seed();
  await rt.queue.idle();
  return rt;
}

describe("uploads", () => {
  it("stores a video under its content hash and returns a media reference", async () => {
    const { app } = await runtime();
    const res = await app.request("/uploads", {
      method: "POST",
      body: new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]),
      headers: { "Content-Type": "video/mp4" },
    });
    expect(res.status).toBe(201);
    const json = (await res.json()) as { media: { url: string }; bytes: number };
    expect(json.bytes).toBe(8);
    expect(existsSync(fileURLToPath(json.media.url))).toBe(true);
  });

  it("refuses other file types and files over the cap", async () => {
    const { app } = await runtime();
    const html = await app.request("/uploads", {
      method: "POST",
      body: "<html>",
      headers: { "Content-Type": "text/html" },
    });
    expect(html.status).toBe(415);
    const big = await app.request("/uploads", {
      method: "POST",
      body: new Uint8Array(2000),
      headers: { "Content-Type": "video/mp4" },
    });
    expect(big.status).toBe(413);
  });
});

describe("POST /guides media locations", () => {
  const create = (url: string) => ({
    source: { kind: "video", title: "Job", location: url },
    media: { kind: "url", url },
  });

  it("refuses local files outside the uploads directory", async () => {
    const { app } = await runtime();
    for (const url of ["file:///etc/passwd", `file://${dir}/../escape.mp4`]) {
      const res = await app.request("/guides", {
        method: "POST",
        body: JSON.stringify(create(url)),
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(400);
    }
  });

  it("accepts an uploaded file and a pasted document as a data URL", async () => {
    const { app } = await runtime();
    const ok = await app.request("/guides", {
      method: "POST",
      body: JSON.stringify(create(`file://${dir}/abc.mp4`)),
      headers: { "Content-Type": "application/json" },
    });
    expect(ok.status).toBe(202);
    const doc = await app.request("/guides", {
      method: "POST",
      body: JSON.stringify({
        source: { kind: "document", title: "Manual", location: "manual.md" },
        media: { kind: "url", url: "data:text/markdown;base64,MS4gT3Blbi4=" },
        documentText: "1. Open.",
      }),
      headers: { "Content-Type": "application/json" },
    });
    expect(doc.status).toBe(202);
  });
});

describe("build progress and media", () => {
  it("reports the seeded build's stages", async () => {
    const { app } = await runtime();
    const res = await app.request("/guides/ps1-buttons/build");
    const status = BuildStatus.parse(await res.json());
    expect(status.stages.map((s) => s.state)).toEqual(["done", "done", "done", "done"]);
    expect((await app.request("/guides/unknown/build")).status).toBe(404);
  });

  it("serves evidence frames from a session and nothing else", async () => {
    const { app } = await runtime({ APPRENTICE_FAKE_JUDGE: "pass" });
    const post = (path: string, body: unknown) =>
      app.request(path, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      });
    const start = CoachUpdate.parse(
      await (await post("/sessions", { guideId: "ps1-buttons" })).json(),
    );
    const id = start.session.id;
    await post(`/sessions/${id}/events`, { type: "begin" });
    await post(`/sessions/${id}/events`, { type: "check" });
    const jpeg = Buffer.from([0xff, 0xd8, 0xff]).toString("base64");
    await post(`/sessions/${id}/frames`, { frames: [{ mime: "image/jpeg", data: jpeg }] });
    const frame = await app.request(`/media/sessions/${id}/frames/000001.jpg`);
    expect(frame.status).toBe(200);
    expect(frame.headers.get("content-type")).toBe("image/jpeg");
    expect((await app.request("/media/guides/secret.json")).status).toBe(404);
  });

  it("returns 404 for a reference frame it cannot extract (fake mode)", async () => {
    const { app } = await runtime();
    expect((await app.request("/guides/ps1-buttons/frame?t=10")).status).toBe(404);
    expect((await app.request("/guides/ps1-buttons/frame?t=abc")).status).toBe(404);
  });
});
