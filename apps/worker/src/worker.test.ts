import { InMemoryGuideRepository, type UsageEvent } from "@apprentice/core";
import { BUILD_GUIDE_JOB, MemoryArtifactStore } from "@apprentice/pipeline";
import { PgBossQueue, PgGuideRepository, migrate } from "@apprentice/store";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { WorkerEnv } from "./env.js";
import { createHandlers } from "./worker.js";

const payload = {
  guideId: "g1",
  source: {
    id: "s1",
    kind: "video",
    title: "PS1 buttons",
    location: "fixture://ps1_buttons/source",
    durationS: 463.8,
  },
  media: { kind: "url", url: "fixture://ps1_buttons/source" },
};

describe("worker handlers", () => {
  it("builds a guide from a queued payload with fake adapters", async () => {
    const guides = new InMemoryGuideRepository();
    const usage: UsageEvent[] = [];
    const { mode, handlers } = await createHandlers({
      env: WorkerEnv.parse({
        DATABASE_URL: "postgres://unused",
        APPRENTICE_ADAPTERS: "fake",
        MEDIA_STORE: "memory",
      }),
      guides,
      artifacts: new MemoryArtifactStore(),
      recordUsage: (e) => usage.push(e),
    });
    expect(mode).toBe("fake");
    await handlers[BUILD_GUIDE_JOB](payload);
    expect((await guides.get("g1"))?.steps).toHaveLength(10);
    expect(usage).toEqual([]); // fakes are not metered: nothing was paid for
  });
});

const url = process.env.TEST_DATABASE_URL;

describe.runIf(url)("worker on Postgres and pg-boss", () => {
  it("picks up a build job from the queue and saves the guide", async () => {
    if (!url) return;
    const pool = new pg.Pool({ connectionString: url });
    await migrate(pool);
    await pool.query("delete from guides where id = 'g1'");
    const guides = new PgGuideRepository(pool);
    const { handlers } = await createHandlers({
      env: WorkerEnv.parse({
        DATABASE_URL: url,
        APPRENTICE_ADAPTERS: "fake",
        MEDIA_STORE: "memory",
      }),
      guides,
      artifacts: new MemoryArtifactStore(),
      recordUsage: () => undefined,
    });
    const queue = await PgBossQueue.connect(url, [BUILD_GUIDE_JOB]);
    const done = new Promise<void>(
      (resolve) =>
        void queue.work(BUILD_GUIDE_JOB, async (p) => {
          await handlers[BUILD_GUIDE_JOB](p);
          // The queue is shared with other suites' jobs; wait for this test's guide.
          if (typeof p === "object" && p !== null && "guideId" in p && p.guideId === "g1")
            resolve();
        }),
    );
    await queue.enqueue(BUILD_GUIDE_JOB, payload);
    await done;
    expect((await guides.get("g1"))?.status).toBe("draft");
    await queue.stop();
    await pool.end();
  }, 30_000);
});
