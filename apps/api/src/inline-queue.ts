import type { JobQueue } from "@apprentice/core";

export type JobHandler = (payload: unknown) => Promise<void>;

/**
 * Runs jobs in this process, for single-process development without Postgres. Jobs start on
 * the next turn of the event loop, so the request that enqueued them returns first. `idle()` lets tests wait.
 */
export class InlineQueue implements JobQueue {
  private readonly running = new Set<Promise<void>>();
  private counter = 0;

  constructor(
    private readonly handlers: Record<string, JobHandler>,
    private readonly onError: (name: string, error: unknown) => void = (name, error) =>
      console.error(`Job ${name} failed`, error),
  ) {}

  async enqueue(name: string, payload: unknown): Promise<string> {
    const handler = this.handlers[name];
    if (!handler) throw new Error(`No handler for job ${name}`);
    const id = `inline-${++this.counter}`;
    const run = new Promise<void>((resolve) => setImmediate(resolve))
      .then(() => handler(payload))
      .catch((error: unknown) => this.onError(name, error))
      .finally(() => this.running.delete(run));
    this.running.add(run);
    return id;
  }

  async idle(): Promise<void> {
    while (this.running.size > 0) await Promise.all(this.running);
  }
}
