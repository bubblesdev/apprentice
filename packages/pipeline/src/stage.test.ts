import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MemoryArtifactStore, runStage, stageKey, type Stage } from "./stage.js";

const Output = z.object({ doubled: z.number() });

function counting(version = 1): Stage<{ n: number }, typeof Output, { runs: number }> {
  return {
    name: "double",
    version,
    output: Output,
    async run(input, deps) {
      deps.runs++;
      return { doubled: input.n * 2 };
    },
  };
}

describe("runStage", () => {
  it("runs a stage once per input and reuses the stored artifact after", async () => {
    const store = new MemoryArtifactStore();
    const deps = { runs: 0 };
    const first = await runStage(counting(), { n: 2 }, deps, store);
    const second = await runStage(counting(), { n: 2 }, deps, store);
    expect(first).toMatchObject({ output: { doubled: 4 }, reused: false });
    expect(second).toMatchObject({ output: { doubled: 4 }, reused: true, key: first.key });
    expect(deps.runs).toBe(1);
  });

  it("re-runs for a new input or a new stage version", async () => {
    const store = new MemoryArtifactStore();
    const deps = { runs: 0 };
    await runStage(counting(), { n: 2 }, deps, store);
    await runStage(counting(), { n: 3 }, deps, store);
    await runStage(counting(2), { n: 2 }, deps, store);
    expect(deps.runs).toBe(3);
    expect(store.keys()).toHaveLength(3);
  });

  it("recomputes a stored artifact that no longer validates", async () => {
    const store = new MemoryArtifactStore();
    await store.put(stageKey("double", 1, { n: 2 }), { doubled: "four" });
    const deps = { runs: 0 };
    expect((await runStage(counting(), { n: 2 }, deps, store)).reused).toBe(false);
  });

  it("refuses to store output that fails the stage's schema", async () => {
    const broken: Stage<{ n: number }, typeof Output, unknown> = {
      ...counting(),
      run: async () => ({ doubled: Number.NaN }),
    };
    const store = new MemoryArtifactStore();
    await expect(runStage(broken, { n: 1 }, undefined, store)).rejects.toThrow();
    expect(store.keys()).toEqual([]);
  });

  it("keys inputs by content, whatever their key order", () => {
    expect(stageKey("s", 1, { a: 1, b: 2 })).toBe(stageKey("s", 1, { b: 2, a: 1 }));
    expect(stageKey("s", 1, { a: 1 })).toMatch(/^s@v1:[0-9a-f]{64}$/);
  });
});
