import { createHash } from "node:crypto";
import { canonicalJson } from "@apprentice/core";
import type { z } from "zod";

/** Where stage outputs are kept: memory in tests, Postgres in the worker. Values are JSON. */
export interface ArtifactStore {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
}

export class MemoryArtifactStore implements ArtifactStore {
  private readonly entries = new Map<string, unknown>();

  async get(key: string): Promise<unknown> {
    return this.entries.get(key);
  }

  async put(key: string, value: unknown): Promise<void> {
    this.entries.set(key, structuredClone(value));
  }

  keys(): string[] {
    return [...this.entries.keys()];
  }
}

/**
 * One pipeline stage. `version` is bumped whenever the stage's logic or prompt changes, which
 * invalidates its stored outputs (and only those: a later stage re-runs only if its input,
 * this stage's output, actually changes).
 */
export interface Stage<I, O extends z.ZodTypeAny, D> {
  name: string;
  version: number;
  output: O;
  run(input: I, deps: D): Promise<z.input<O>>;
}

export function stageKey(name: string, version: number, input: unknown): string {
  const hash = createHash("sha256").update(canonicalJson(input)).digest("hex");
  return `${name}@v${version}:${hash}`;
}

export interface StageResult<T> {
  output: T;
  key: string;
  /** True when a stored artifact was reused and the stage did not run. */
  reused: boolean;
}

/**
 * Runs a stage at most once per (name, version, input). The output is validated before it is
 * stored and again when it is read back, so a corrupt or outdated artifact is recomputed.
 */
export async function runStage<I, O extends z.ZodTypeAny, D>(
  stage: Stage<I, O, D>,
  input: I,
  deps: D,
  store: ArtifactStore,
): Promise<StageResult<z.output<O>>> {
  const key = stageKey(stage.name, stage.version, input);
  const stored = stage.output.safeParse(await store.get(key));
  if (stored.success) return { output: stored.data, key, reused: true };
  const output: z.output<O> = stage.output.parse(await stage.run(input, deps));
  await store.put(key, output);
  return { output, key, reused: false };
}
