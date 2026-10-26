import type { FrameExtractor, GuideRepository, UsageEvent } from "@apprentice/core";
import { CostMeter, createMetaAdapters } from "@apprentice/meta";
import { FakeFrameExtractor } from "@apprentice/meta/fake";
import {
  BUILD_GUIDE_JOB,
  FfmpegFrameExtractor,
  buildGuideHandler,
  type ArtifactStore,
} from "@apprentice/pipeline";
import type { WorkerEnv } from "./env.js";

export interface WorkerDeps {
  env: WorkerEnv;
  guides: GuideRepository;
  artifacts: ArtifactStore;
  recordUsage: (event: UsageEvent) => void;
  fixturesDir?: string;
}

/** Job handlers by queue name. Each guide build gets its own metered, capped Meta adapters. */
export async function createHandlers(deps: WorkerDeps) {
  const { env } = deps;
  const adapters = (meter: CostMeter) =>
    createMetaAdapters({
      env,
      meter,
      ...(deps.fixturesDir ? { fixturesDir: deps.fixturesDir } : {}),
    });
  const probe = await adapters(new CostMeter({ scope: { kind: "eval", id: "probe" } }));
  const frames: FrameExtractor =
    probe.mode === "fake"
      ? new FakeFrameExtractor(env.APPRENTICE_FIXTURE_JOB)
      : new FfmpegFrameExtractor();
  return {
    mode: probe.mode,
    handlers: {
      [BUILD_GUIDE_JOB]: buildGuideHandler({
        guides: deps.guides,
        store: deps.artifacts,
        frames,
        adaptersFor: (guideId) =>
          adapters(
            new CostMeter({
              scope: { kind: "guide", id: guideId },
              capUsd: env.GUIDE_BUDGET_USD,
              onEvent: deps.recordUsage,
            }),
          ),
        onProgress: (guideId, p) =>
          console.log(
            `[${guideId}] ${p.stage} ${p.state}${p.reused ? " (reused)" : ""}${p.detail ? `: ${p.detail}` : ""}`,
          ),
      }),
    },
  };
}
