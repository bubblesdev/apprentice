import { Guide, type UsageEvent } from "@apprentice/core";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PgArtifactStore,
  PgBuildStatusRepository,
  PgGuideRepository,
  PgSessionRepository,
  PgUsageLog,
  migrate,
} from "./postgres.js";
import { PgBossQueue } from "./queue.js";

/** Integration tests against a real Postgres; set TEST_DATABASE_URL to run them. */
const url = process.env.TEST_DATABASE_URL;

const guide = Guide.parse({
  id: "g1",
  title: "Fix sticky buttons",
  status: "draft",
  version: 1,
  source: { id: "s1", kind: "video", title: "PS1", location: "ps1.mp4" },
  steps: [
    { index: 0, title: "Open", instruction: "Open it.", startS: 0, endS: 5, doneWhen: "Open." },
  ],
});

describe.runIf(url)("Postgres store", () => {
  const pool = new pg.Pool({ connectionString: url });
  beforeAll(async () => {
    await migrate(pool);
    await migrate(pool); // idempotent
    await pool.query("truncate guides, sessions, artifacts, usage_events, guide_builds");
  });
  afterAll(() => pool.end());

  it("stores and lists guides, newest first, validated on read", async () => {
    const repo = new PgGuideRepository(pool);
    await repo.put(guide);
    await repo.put({ ...guide, id: "g2", title: "Second" });
    await repo.put({ ...guide, version: 2 });
    expect(await repo.get("g1")).toEqual({ ...guide, version: 2 });
    expect((await repo.list()).map((g) => g.id)).toEqual(["g1", "g2"]);
    expect(await repo.get("missing")).toBeUndefined();
    await pool.query(`update guides set doc = '{"id":"g2"}' where id = 'g2'`);
    await expect(repo.get("g2")).rejects.toThrow();
  });

  it("stores sessions", async () => {
    const repo = new PgSessionRepository(pool);
    const session = {
      id: "s1",
      guideId: "g1",
      guideVersion: 1,
      state: "doing" as const,
      stepIndex: 0,
      verdicts: [],
      startedAt: "2026-10-27T10:00:00.000Z",
    };
    await repo.put(session);
    await repo.put({ ...session, state: "verifying" });
    expect((await repo.get("s1"))?.state).toBe("verifying");
    await repo.put({ ...session, id: "s2", guideId: "other" });
    expect((await repo.listByGuide("g1")).map((s) => s.id)).toEqual(["s1"]);
  });

  it("stores build progress per guide", async () => {
    const repo = new PgBuildStatusRepository(pool);
    const status = {
      guideId: "g1",
      stages: [{ stage: "draft_steps" as const, state: "done" as const, detail: "10 steps found" }],
      updatedAt: "2026-10-27T10:00:00.000Z",
    };
    await repo.put(status);
    await repo.put({ ...status, error: "Budget used" });
    expect(await repo.get("g1")).toEqual({ ...status, error: "Budget used" });
  });

  it("stores pipeline artifacts by key", async () => {
    const store = new PgArtifactStore(pool);
    await store.put("draft_steps@v1:abc", { steps: [1, 2] });
    expect(await store.get("draft_steps@v1:abc")).toEqual({ steps: [1, 2] });
    expect(await store.get("nope")).toBeUndefined();
  });

  it("logs usage events per scope", async () => {
    const log = new PgUsageLog(pool);
    const event: UsageEvent = {
      scope: { kind: "guide", id: "g1" },
      operation: "draft_steps",
      usage: { unit: "tokens", model: "muse-spark-1.3", inputTokens: 10, outputTokens: 2 },
      costUsd: 0.01,
      cached: false,
      at: "2026-10-27T10:00:00.000Z",
    };
    await log.record(event);
    expect(await log.list({ kind: "guide", id: "g1" })).toEqual([event]);
    expect(await log.spentSince("2026-10-27T00:00:00.000Z")).toBeCloseTo(0.01);
    expect(await log.spentSince("2026-10-28T00:00:00.000Z")).toBe(0);
  });

  it("delivers a queued job to a worker through pg-boss", async () => {
    if (!url) return;
    const queue = await PgBossQueue.connect(url, ["test-job"]);
    const received = new Promise<unknown>(
      (resolve) => void queue.work("test-job", async (p) => resolve(p)),
    );
    await queue.enqueue("test-job", { guideId: "g1" });
    expect(await received).toEqual({ guideId: "g1" });
    await queue.stop();
  }, 20_000);
});
