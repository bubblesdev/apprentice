import { BUILD_GUIDE_JOB } from "@apprentice/pipeline";
import { withoutBlankValues } from "@apprentice/core";
import {
  PgArtifactStore,
  PgBossQueue,
  PgGuideRepository,
  PgUsageLog,
  migrate,
} from "@apprentice/store";
import pg from "pg";
import { WorkerEnv } from "./env.js";
import { createHandlers } from "./worker.js";

const env = WorkerEnv.parse(withoutBlankValues(process.env));
const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
await migrate(pool);
const usage = new PgUsageLog(pool);
const { mode, handlers } = await createHandlers({
  env,
  guides: new PgGuideRepository(pool),
  artifacts: new PgArtifactStore(pool),
  recordUsage: (e) => void usage.record(e).catch((err: unknown) => console.error("usage log", err)),
});
const queue = await PgBossQueue.connect(env.DATABASE_URL, [BUILD_GUIDE_JOB]);
for (const [name, handler] of Object.entries(handlers)) await queue.work(name, handler);
console.log(`Apprentice worker ready (Meta adapters: ${mode})`);

async function shutdown(): Promise<void> {
  await queue.stop();
  await pool.end();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
