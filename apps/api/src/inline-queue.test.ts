import { describe, expect, it } from "vitest";
import { InlineQueue } from "./inline-queue.js";

describe("InlineQueue", () => {
  it("runs jobs after the enqueue call returns, and reports failures", async () => {
    const order: string[] = [];
    const failures: string[] = [];
    const queue = new InlineQueue(
      {
        ok: async (p) => void order.push(`ran ${String(p)}`),
        bad: async () => {
          throw new Error("boom");
        },
      },
      (name) => failures.push(name),
    );
    await queue.enqueue("ok", 1);
    order.push("returned");
    await queue.enqueue("bad", 2);
    await queue.idle();
    expect(order).toEqual(["returned", "ran 1"]);
    expect(failures).toEqual(["bad"]);
  });

  it("refuses an unknown job", async () => {
    await expect(new InlineQueue({}).enqueue("nope", {})).rejects.toThrow(/No handler/);
  });
});
