import {
  applyBuildStage,
  systemClock,
  type BuildStatus,
  type BuildStatusRepository,
  type Clock,
  type GuideRepository,
} from "@apprentice/core";
import type { z } from "zod";
import { buildGuide, type PipelineProgress } from "./build.js";
import { PipelineConfig, type PipelineDeps } from "./config.js";
import { PipelineInput } from "./schemas.js";
import type { ArtifactStore } from "./stage.js";

export const BUILD_GUIDE_JOB = "build-guide";

/** The queued job's payload: exactly the pipeline input, validated when it is dequeued. */
export const BuildGuidePayload = PipelineInput;
export type BuildGuidePayload = z.infer<typeof BuildGuidePayload>;

export interface BuildGuideJobDeps {
  pipeline: PipelineDeps;
  store: ArtifactStore;
  guides: GuideRepository;
  config?: z.input<typeof PipelineConfig>;
  onProgress?: (guideId: string, progress: PipelineProgress) => void;
}

/**
 * Builds a guide and saves it as a draft. Safe to retry: stages already done are reused, and a
 * guide the author has approved is never overwritten by a rebuild.
 */
export async function runBuildGuideJob(payload: unknown, deps: BuildGuideJobDeps): Promise<void> {
  const input = BuildGuidePayload.parse(payload);
  const previous = await deps.guides.get(input.guideId);
  if (previous?.status === "approved") return;
  const { guide } = await buildGuide(input, deps.pipeline, {
    store: deps.store,
    version: previous && previous.steps.length > 0 ? previous.version + 1 : 1,
    ...(deps.config ? { config: deps.config } : {}),
    ...(deps.onProgress
      ? { onProgress: (p: PipelineProgress) => deps.onProgress?.(input.guideId, p) }
      : {}),
  });
  await deps.guides.put(guide);
}

export interface BuildGuideHandlerDeps extends Omit<BuildGuideJobDeps, "pipeline"> {
  /** Model adapters for one guide build, metered and capped against that guide. */
  adaptersFor: (guideId: string) => Promise<Pick<PipelineDeps, "reasoner" | "segmenter">>;
  frames: PipelineDeps["frames"];
  /** Where progress is recorded for the Building screen. */
  builds?: BuildStatusRepository;
  /** Runs before the build, e.g. downloading a direct video link (see ingestRemoteVideo). */
  prepare?: (payload: BuildGuidePayload) => Promise<BuildGuidePayload>;
  clock?: Clock;
}

/** A queue handler for BUILD_GUIDE_JOB, shared by the worker (pg-boss) and the API's inline queue. */
export function buildGuideHandler(
  deps: BuildGuideHandlerDeps,
): (payload: unknown) => Promise<void> {
  const clock = deps.clock ?? systemClock;
  return async (raw) => {
    const parsed = BuildGuidePayload.parse(raw);
    const { guideId } = parsed;
    // Progress writes are chained so they land in order and never race each other.
    let writes = Promise.resolve();
    const record = (update: (s: BuildStatus | undefined) => BuildStatus) => {
      const builds = deps.builds;
      if (!builds) return;
      writes = writes.then(async () => builds.put(update(await builds.get(guideId))));
    };
    try {
      const payload = deps.prepare ? await deps.prepare(parsed) : parsed;
      const { reasoner, segmenter } = await deps.adaptersFor(guideId);
      await runBuildGuideJob(payload, {
        ...deps,
        pipeline: { reasoner, segmenter, frames: deps.frames },
        onProgress: (id, p) => {
          deps.onProgress?.(id, p);
          record((s) => applyBuildStage(s, guideId, p, clock.now().toISOString()));
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      record((s) => ({
        guideId,
        stages: s?.stages ?? [],
        error: message,
        updatedAt: clock.now().toISOString(),
      }));
      throw error;
    } finally {
      await writes;
    }
  };
}
