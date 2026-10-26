import type { Illustrator, Segmenter, Transcriber, VisionReasoner } from "@apprentice/core";
import { z } from "zod";
import { CachedMetaApi, FileResponseCache } from "./cache.js";
import { DEFAULT_BASE_URL, MetaClient } from "./client.js";
import {
  FakeIllustrator,
  FakeReasoner,
  FakeSegmenter,
  FakeTranscriber,
  loadJobFixture,
} from "./fake/index.js";
import { MuseIllustrator } from "./illustrator.js";
import { MuseTranscriber } from "./transcriber.js";
import type { CostMeter } from "./meter.js";
import { RetryingMetaApi } from "./retry.js";
import { SamSegmenter } from "./sam-segmenter.js";
import { SparkReasoner } from "./spark.js";

/**
 * - live: real Meta calls, each distinct request recorded in the cache and paid for once.
 * - replay: recorded responses only; a request that was never recorded fails, nothing is paid.
 * - fake: fixtures/ outputs from the day-1 spikes; no cache, no network.
 * - auto: live when a key is set, otherwise fake.
 */
export const AdapterMode = z.enum(["auto", "live", "replay", "fake"]);
export type AdapterMode = z.infer<typeof AdapterMode>;

export const MetaEnv = z.object({
  META_MODEL_API_KEY: z.string().optional(),
  META_MODEL_API_URL: z.string().url().default(DEFAULT_BASE_URL),
  META_CACHE_DIR: z.string().min(1).default(".cache/meta"),
  APPRENTICE_ADAPTERS: AdapterMode.default("auto"),
  APPRENTICE_FIXTURE_JOB: z.string().min(1).default("ps1_buttons"),
  /**
   * Fake mode only. `recorded` answers unrecorded frames (any live camera frame) with "unclear";
   * `pass` answers them "done", so the coach UI can be walked end to end during development.
   */
  APPRENTICE_FAKE_JUDGE: z.enum(["recorded", "pass"]).default("recorded"),
});
export type MetaEnv = z.infer<typeof MetaEnv>;

export const DEV_PASS_SENTENCE = "Development mode: every check passes. No model was called.";

export interface MetaAdapters {
  mode: Exclude<AdapterMode, "auto">;
  reasoner: VisionReasoner;
  segmenter: Segmenter;
  illustrator: Illustrator;
  transcriber: Transcriber;
}

export interface CreateAdaptersOptions {
  env: MetaEnv;
  /** Meter for the guide or session these adapters serve. */
  meter?: CostMeter;
  fixturesDir?: string;
}

/** Builds the VisionReasoner and Segmenter the rest of the system uses, from validated env. */
export async function createMetaAdapters(options: CreateAdaptersOptions): Promise<MetaAdapters> {
  const { env, meter } = options;
  const key = env.META_MODEL_API_KEY?.trim();
  const mode =
    env.APPRENTICE_ADAPTERS === "auto" ? (key ? "live" : "fake") : env.APPRENTICE_ADAPTERS;

  if (mode === "fake") {
    const fixture = await loadJobFixture(env.APPRENTICE_FIXTURE_JOB, options.fixturesDir);
    const judge =
      env.APPRENTICE_FAKE_JUDGE === "pass"
        ? () => ({ kind: "done" as const, confidence: 0.9, sentence: DEV_PASS_SENTENCE })
        : undefined;
    return {
      mode,
      reasoner: new FakeReasoner({ fixture, ...(judge ? { judge } : {}) }),
      segmenter: new FakeSegmenter(fixture),
      illustrator: new FakeIllustrator(),
      transcriber: new FakeTranscriber(),
    };
  }

  if (mode === "live" && !key) throw new Error("APPRENTICE_ADAPTERS=live needs META_MODEL_API_KEY");
  const live = key
    ? new RetryingMetaApi(new MetaClient({ apiKey: key, baseUrl: env.META_MODEL_API_URL }))
    : undefined;
  const api = new CachedMetaApi(
    new FileResponseCache(env.META_CACHE_DIR),
    mode === "live" ? live : undefined,
  );
  const deps = { api, files: api, ...(meter ? { meter } : {}) };
  return {
    mode,
    reasoner: new SparkReasoner(deps),
    segmenter: new SamSegmenter(deps),
    illustrator: new MuseIllustrator(deps),
    transcriber: new MuseTranscriber(deps),
  };
}
