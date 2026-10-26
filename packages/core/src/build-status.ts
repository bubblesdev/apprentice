import { z } from "zod";

/** Progress of one guide build, for the Building screen. */
export const BuildStage = z.object({
  stage: z.enum([
    "draft_steps",
    "refine_boundaries",
    "reference_frames",
    "ground_parts",
    "draw_diagrams",
  ]),
  state: z.enum(["running", "done", "skipped"]),
  reused: z.boolean().optional(),
  detail: z.string().optional(),
});
export type BuildStage = z.infer<typeof BuildStage>;

export const BuildStatus = z.object({
  guideId: z.string().min(1),
  stages: z.array(BuildStage),
  /** Set when the build failed; the job may still be retried. */
  error: z.string().optional(),
  updatedAt: z.string().datetime(),
});
export type BuildStatus = z.infer<typeof BuildStatus>;

export interface BuildStatusRepository {
  get(guideId: string): Promise<BuildStatus | undefined>;
  put(status: BuildStatus): Promise<void>;
}

export class InMemoryBuildStatusRepository implements BuildStatusRepository {
  private readonly items = new Map<string, BuildStatus>();

  async get(guideId: string): Promise<BuildStatus | undefined> {
    return this.items.get(guideId);
  }

  async put(status: BuildStatus): Promise<void> {
    this.items.set(status.guideId, status);
  }
}

/** Folds one progress event into a status: a stage's latest state replaces its earlier one. */
export function applyBuildStage(
  status: BuildStatus | undefined,
  guideId: string,
  stage: BuildStage,
  at: string,
): BuildStatus {
  const stages = (status?.stages ?? []).filter((s) => s.stage !== stage.stage);
  return { guideId, stages: [...stages, stage], updatedAt: at };
}
