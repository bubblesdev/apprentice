import type { GuideRepository } from "@apprentice/core";
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
}

/** A queue handler for BUILD_GUIDE_JOB, shared by the worker (pg-boss) and the API's inline queue. */
export function buildGuideHandler(
  deps: BuildGuideHandlerDeps,
): (payload: unknown) => Promise<void> {
  return async (payload) => {
    const { guideId } = BuildGuidePayload.parse(payload);
    const { reasoner, segmenter } = await deps.adaptersFor(guideId);
    await runBuildGuideJob(payload, {
      ...deps,
      pipeline: { reasoner, segmenter, frames: deps.frames },
    });
  };
}
