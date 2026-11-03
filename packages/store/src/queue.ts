import type { JobQueue } from "@apprentice/core";
import PgBoss from "pg-boss";

export type JobHandler = (payload: unknown) => Promise<void>;

/**
 * pg-boss on the same Postgres as the data (ADR 0005): no Redis to run. Jobs retry with backoff,
 * which is safe because the guide pipeline reuses every stage it already finished.
 */
export class PgBossQueue implements JobQueue {
  private constructor(private readonly boss: PgBoss) {}

  static async connect(connectionString: string, queues: readonly string[]): Promise<PgBossQueue> {
    const boss = new PgBoss(connectionString);
    boss.on("error", (error) => console.error("pg-boss", error));
    await boss.start();
    for (const name of queues) await boss.createQueue(name);
    return new PgBossQueue(boss);
  }

  async enqueue(name: string, payload: unknown): Promise<string> {
    const data = payload !== null && typeof payload === "object" ? payload : { value: payload };
    const id = await this.boss.send(name, data, {
      retryLimit: 3,
      retryDelay: 30,
      retryBackoff: true,
    });
    if (!id) throw new Error(`pg-boss refused job ${name}`);
    return id;
  }

  /** Runs `handler` for each job on `name`, one batch at a time. A thrown error fails and retries the job. */
  async work(name: string, handler: JobHandler): Promise<void> {
    await this.boss.work<object>(name, async (jobs) => {
      for (const job of jobs) await handler(job.data);
    });
  }

  async stop(): Promise<void> {
    await this.boss.stop({ graceful: true });
  }
}
