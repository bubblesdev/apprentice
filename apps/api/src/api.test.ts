import type { AddressInfo } from "node:net";
import { CoachUpdate, ServerMessage } from "@apprentice/core";
import { serve } from "@hono/node-server";
import { describe, expect, it } from "vitest";
import WebSocket from "ws";
import { ApiEnv, createRuntime } from "./runtime.js";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString("base64");
const frames = { frames: [{ mime: "image/jpeg", data: JPEG }] };

let ids = 0;
async function runtime(env: Record<string, string> = {}) {
  const rt = await createRuntime(ApiEnv.parse({ APPRENTICE_ADAPTERS: "fake", ...env }), {
    newId: () => `id-${++ids}`,
  });
  await rt.seed();
  await rt.queue.idle();
  return rt;
}

type App = Awaited<ReturnType<typeof runtime>>["app"];

async function call(app: App, method: string, path: string, body?: unknown) {
  const res = await app.request(path, {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

async function event(app: App, sessionId: string, type: string) {
  return call(app, "POST", `/sessions/${sessionId}/events`, { type });
}

describe("guides", () => {
  it("serves the seeded guide built by the pipeline from fixtures", async () => {
    const { app } = await runtime();
    const list = await call(app, "GET", "/guides");
    expect(list.status).toBe(200);
    const guide = await call(app, "GET", "/guides/ps1-buttons");
    expect(guide.json).toMatchObject({ status: "draft", title: "Fix sticky PlayStation buttons" });
    expect((guide.json.steps as unknown[]).length).toBe(10);
  });

  it("queues a build and returns 202 with the new guide id", async () => {
    const rt = await runtime({ SEED_FIXTURE_GUIDE: "false" });
    const res = await call(rt.app, "POST", "/guides", {
      source: {
        kind: "video",
        title: "Test job",
        location: "fixture://ps1_buttons/source",
        durationS: 463.8,
      },
      media: { kind: "provider_file", fileId: "file-1" },
    });
    expect(res.status).toBe(202);
    const guideId = String(res.json.guideId);
    expect((await call(rt.app, "GET", `/guides/${guideId}`)).json.status).toBe("building");
    await rt.queue.idle();
    expect((await call(rt.app, "GET", `/guides/${guideId}`)).json.status).toBe("draft");
    expect((await call(rt.app, "POST", `/guides/${guideId}/approve`)).json.status).toBe("approved");
  });

  it("rejects an invalid body with 400 and the zod issues", async () => {
    const { app } = await runtime();
    const res = await call(app, "POST", "/guides", { source: { kind: "fax" } });
    expect(res.status).toBe(400);
    expect(res.json.issues).toBeDefined();
  });

  it("returns 404 for an unknown guide", async () => {
    const { app } = await runtime();
    expect((await call(app, "GET", "/guides/nope")).status).toBe(404);
    expect((await call(app, "POST", "/sessions", { guideId: "nope" })).status).toBe(404);
  });
});

describe("live sessions over HTTP", () => {
  it("walks a step: briefing, doing, verifying, two agreeing samples, passed, next", async () => {
    const { app, coach } = await runtime({ APPRENTICE_FAKE_JUDGE: "pass" });
    const start = await call(app, "POST", "/sessions", { guideId: "ps1-buttons" });
    expect(start.status).toBe(201);
    const first = CoachUpdate.parse(start.json);
    expect(first.session.state).toBe("briefing");
    expect(first.sampling).toEqual({ framesPerSample: 2, sampleIntervalMs: 1500 });
    const id = first.session.id;

    expect((await event(app, id, "begin")).json).toMatchObject({ session: { state: "doing" } });
    await event(app, id, "check");
    const one = CoachUpdate.parse((await call(app, "POST", `/sessions/${id}/frames`, frames)).json);
    expect(one.decision).toMatchObject({ kind: "confirming", agreeing: 1, needed: 2 });
    const two = CoachUpdate.parse((await call(app, "POST", `/sessions/${id}/frames`, frames)).json);
    expect(two.session.state).toBe("passed");
    expect(two.session.verdicts[0]?.evidence.frameKeys).toHaveLength(2);
    expect((await event(app, id, "next")).json).toMatchObject({ session: { stepIndex: 1 } });

    const report = await call(app, "GET", `/sessions/${id}/report`);
    expect(report.json).toMatchObject({ passed: 1, total: 10, complete: false });
    expect(coach.get(id).session.verdicts).toHaveLength(1);
  });

  it("asks for a closer look on unrecorded frames and allows an override after three", async () => {
    const { app } = await runtime();
    const id = CoachUpdate.parse(
      (await call(app, "POST", "/sessions", { guideId: "ps1-buttons" })).json,
    ).session.id;
    await event(app, id, "begin");
    let update: CoachUpdate | undefined;
    for (let i = 0; i < 3; i++) {
      await event(app, id, "check");
      update = CoachUpdate.parse((await call(app, "POST", `/sessions/${id}/frames`, frames)).json);
      expect(update.decision).toMatchObject({ kind: "closer", reason: "unclear" });
    }
    expect(update?.canOverride).toBe(true);
    const overridden = await event(app, id, "override");
    expect(overridden.json).toMatchObject({ session: { state: "passed" } });
  });

  it("refuses events and frames that do not fit the current state with 409", async () => {
    const { app } = await runtime();
    const id = CoachUpdate.parse(
      (await call(app, "POST", "/sessions", { guideId: "ps1-buttons" })).json,
    ).session.id;
    expect((await event(app, id, "next")).status).toBe(409);
    expect((await call(app, "POST", `/sessions/${id}/frames`, frames)).status).toBe(409);
    expect((await event(app, id, "teleport")).status).toBe(400);
    expect((await call(app, "GET", "/sessions/unknown")).status).toBe(404);
  });

  it("does not start a session on a guide that is still building", async () => {
    const rt = await createRuntime(ApiEnv.parse({ APPRENTICE_ADAPTERS: "fake" }), {
      newId: () => `b-${++ids}`,
    });
    await rt.seed();
    expect((await call(rt.app, "POST", "/sessions", { guideId: "ps1-buttons" })).status).toBe(409);
    await rt.queue.idle();
  });
});

describe("live sessions over WebSocket", () => {
  it("applies events and frames and pushes updates", async () => {
    const rt = await runtime({ APPRENTICE_FAKE_JUDGE: "pass" });
    const server = serve({ fetch: rt.app.fetch, port: 0 });
    rt.injectWebSocket(server);
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    const { port } = server.address() as AddressInfo;
    const id = (await rt.coach.start("ps1-buttons")).session.id;

    const ws = new WebSocket(`ws://localhost:${port}/sessions/${id}/live`);
    const messages: ServerMessage[] = [];
    const next = () =>
      new Promise<ServerMessage>((resolve) =>
        ws.once("message", (data) => resolve(ServerMessage.parse(JSON.parse(String(data))))),
      );
    await new Promise((resolve) => ws.once("open", resolve));

    for (const msg of [
      { type: "event", event: { type: "begin" } },
      { type: "event", event: { type: "check" } },
      { type: "frames", ...frames },
      { type: "frames", ...frames },
      { type: "bogus" },
    ]) {
      ws.send(JSON.stringify(msg));
      messages.push(await next());
    }
    ws.close();
    server.close();

    const states = messages.map((m) => (m.type === "update" ? m.update.session.state : m.message));
    expect(states).toEqual(["doing", "verifying", "verifying", "passed", "Unknown message"]);
  });
});

const databaseUrl = process.env.TEST_DATABASE_URL;

describe.runIf(databaseUrl)("API on Postgres", () => {
  it("saves the placeholder guide and queues the build on pg-boss for the worker", async () => {
    const rt = await createRuntime(
      ApiEnv.parse({
        APPRENTICE_ADAPTERS: "fake",
        DATABASE_URL: databaseUrl,
        SEED_FIXTURE_GUIDE: "false",
      }),
      { newId: () => `pg-${Date.now()}-${++ids}` },
    );
    expect(rt.persistence).toBe("postgres");
    const res = await call(rt.app, "POST", "/guides", {
      source: { kind: "video", title: "Queued job", location: "fixture://ps1_buttons/source" },
      media: { kind: "provider_file", fileId: "file-1" },
    });
    expect(res.status).toBe(202);
    expect(String(res.json.jobId)).toMatch(/[0-9a-f-]{36}/);
    expect((await call(rt.app, "GET", `/guides/${String(res.json.guideId)}`)).json.status).toBe(
      "building",
    );
    await rt.close();
  }, 20_000);
});

describe("guide editing", () => {
  it("applies an edit, bumps the version and refuses a stale one", async () => {
    const { app } = await runtime();
    const patch = (body: unknown) =>
      app.request("/guides/ps1-buttons", {
        method: "PATCH",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      });
    const steps = [
      {
        from: 1,
        title: "Open the shell",
        instruction: "Remove the six screws.",
        doneWhen: "Shell open.",
      },
    ];
    const res = await patch({ version: 1, title: "PS1 buttons", steps });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      version: 2,
      title: "PS1 buttons",
      steps: [{ index: 0, title: "Open the shell", startS: 28 }],
    });
    expect((await patch({ version: 1, title: "Again" })).status).toBe(409);
    expect((await patch({ version: 2, steps: [] })).status).toBe(400);
  });
});
