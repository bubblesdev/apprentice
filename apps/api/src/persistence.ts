import {
  InMemoryBuildStatusRepository,
  InMemoryGuideRepository,
  InMemorySessionRepository,
  type BuildStatusRepository,
  type GuideRepository,
  type JobQueue,
  type SessionRepository,
  type UsageEvent,
} from "@apprentice/core";
import { MemoryArtifactStore, type ArtifactStore } from "@apprentice/pipeline";
import {
  PgArtifactStore,
  PgBossQueue,
  PgBuildStatusRepository,
  PgGuideRepository,
  PgSessionRepository,
  PgUsageLog,
  migrate,
} from "@apprentice/store";
import pg from "pg";
import { InlineQueue, type JobHandler } from "./inline-queue.js";

export interface Persistence {
  kind: "memory" | "postgres";
  guides: GuideRepository;
  sessions: SessionRepository;
  builds: BuildStatusRepository;
  artifacts: ArtifactStore;
  recordUsage: (event: UsageEvent) => void;
  /** In memory, jobs run inline in this process; with Postgres they go to pg-boss for apps/worker. */
  createQueue(handlers: Record<string, JobHandler>): Promise<JobQueue & { idle(): Promise<void> }>;
  close(): Promise<void>;
}

export function memoryPersistence(): Persistence {
  return {
    kind: "memory",
    guides: new InMemoryGuideRepository(),
    sessions: new InMemorySessionRepository(),
    builds: new InMemoryBuildStatusRepository(),
    artifacts: new MemoryArtifactStore(),
    recordUsage: () => undefined,
    createQueue: async (handlers) => new InlineQueue(handlers),
    close: async () => undefined,
  };
}

export async function postgresPersistence(
  connectionString: string,
  queues: readonly string[],
): Promise<Persistence> {
  const pool = new pg.Pool({ connectionString });
  await migrate(pool);
  const usage = new PgUsageLog(pool);
  let boss: PgBossQueue | undefined;
  return {
    kind: "postgres",
    guides: new PgGuideRepository(pool),
    sessions: new PgSessionRepository(pool),
    builds: new PgBuildStatusRepository(pool),
    artifacts: new PgArtifactStore(pool),
    recordUsage: (event) =>
      void usage.record(event).catch((e: unknown) => console.error("usage log", e)),
    createQueue: async () => {
      boss = await PgBossQueue.connect(connectionString, queues);
      const queue = boss;
      return {
        enqueue: (name, payload) => queue.enqueue(name, payload),
        idle: async () => undefined,
      };
    },
    close: async () => {
      await boss?.stop();
      await pool.end();
    },
  };
}
