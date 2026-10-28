import { Guide, type PartRef, type SafetyLevel, type StepDraft } from "@apprentice/core";
import { z } from "zod";
import { PipelineConfig, type PipelineDeps } from "./config.js";
import { PipelineInput } from "./schemas.js";
import { runStage, type ArtifactStore } from "./stage.js";
import { boundaryStage, type BoundaryNote } from "./stages/boundaries.js";
import { diagramStage } from "./stages/diagrams.js";
import { draftStage } from "./stages/draft.js";
import { groundingStage } from "./stages/grounding.js";
import { referenceStage } from "./stages/references.js";
import { mergeSafety, safetyStage } from "./stages/safety.js";

export const StageName = z.enum([
  "draft_steps",
  "refine_boundaries",
  "reference_frames",
  "ground_parts",
  "draw_diagrams",
  "review_safety",
]);
export type StageName = z.infer<typeof StageName>;

/** Progress for the Building screen; `reused` means stored work was used and nothing was paid for. */
export interface PipelineProgress {
  stage: StageName;
  state: "running" | "done" | "skipped";
  reused?: boolean;
  detail?: string;
}

export interface BuildOptions {
  store: ArtifactStore;
  config?: z.input<typeof PipelineConfig>;
  /** The guide's version; pass the previous version + 1 when rebuilding. */
  version?: number;
  onProgress?: (progress: PipelineProgress) => void;
}

export interface BuildResult {
  guide: Guide;
  boundaries: BoundaryNote[];
  /** Artifact keys per stage, for audit and re-runs. */
  artifacts: Partial<Record<StageName, string>>;
}

/** The model's safety call wins; a warning on its own means at least "caution". */
function safetyOf(draft: StepDraft): { level: SafetyLevel; note?: string } {
  const level = draft.safety ?? (draft.warning ? "caution" : "none");
  return draft.warning ? { level, note: draft.warning } : { level };
}

/**
 * Instructions to guide: draft -> boundary refinement -> reference frames -> part grounding.
 * Each stage runs at most once per input (see runStage), so a rebuild after a crash or a config
 * change only pays for the stages whose input changed. Document sources have no video, so
 * boundary refinement and grounding are skipped.
 */
export async function buildGuide(
  rawInput: z.input<typeof PipelineInput>,
  deps: PipelineDeps,
  options: BuildOptions,
): Promise<BuildResult> {
  const input = PipelineInput.parse(rawInput);
  const config = PipelineConfig.parse(options.config ?? {});
  const { store } = options;
  const report = options.onProgress ?? (() => undefined);
  const artifacts: BuildResult["artifacts"] = {};
  const isVideo = input.source.kind !== "document" && !input.documentText;
  const frameSource = input.frameSource ?? input.media;

  report({ stage: "draft_steps", state: "running" });
  const draftInput = input.documentText
    ? { media: input.media, documentText: input.documentText }
    : { media: input.media };
  const drafted = await runStage(draftStage, draftInput, deps, store);
  artifacts.draft_steps = drafted.key;
  report({
    stage: "draft_steps",
    state: "done",
    reused: drafted.reused,
    detail: `${drafted.output.steps.length} steps found`,
  });

  let steps: StepDraft[] = drafted.output.steps;
  let boundaries: BoundaryNote[] = [];
  const durationS = input.source.durationS ?? Math.max(...steps.map((s) => s.endS));
  if (isVideo && durationS > 0) {
    report({ stage: "refine_boundaries", state: "running" });
    const refined = await runStage(
      boundaryStage,
      { media: frameSource, durationS, steps, config: config.boundary },
      deps,
      store,
    );
    artifacts.refine_boundaries = refined.key;
    steps = refined.output.steps;
    boundaries = refined.output.notes;
    const changed = boundaries.filter((b) => b.changed).length;
    report({
      stage: "refine_boundaries",
      state: "done",
      reused: refined.reused,
      detail: `${changed} step ends adjusted`,
    });
  } else {
    report({ stage: "refine_boundaries", state: "skipped", detail: "No video to refine" });
  }

  report({ stage: "reference_frames", state: "running" });
  const refs = await runStage(
    referenceStage,
    {
      steps: steps.map((s) => ({ startS: s.startS, endS: s.endS })),
      fractions: config.referenceFractions,
    },
    undefined,
    store,
  );
  artifacts.reference_frames = refs.key;
  const referenceTimesS = refs.output.referenceTimesS;
  const frameCount = referenceTimesS.reduce((n, t) => n + t.length, 0);
  report({
    stage: "reference_frames",
    state: "done",
    reused: refs.reused,
    detail: `${frameCount} reference frames`,
  });

  let parts: PartRef[][] = steps.map((s) => s.parts.map((name) => ({ name, sightings: [] })));
  if (isVideo) {
    report({ stage: "ground_parts", state: "running" });
    const grounded = await runStage(
      groundingStage,
      {
        media: frameSource,
        steps: steps.map((s, i) => ({ parts: s.parts, referenceTimesS: referenceTimesS[i] ?? [] })),
        config: config.grounding,
      },
      deps,
      store,
    );
    artifacts.ground_parts = grounded.key;
    parts = grounded.output.parts;
    const all = parts.flat();
    const found = all.filter((p) => p.sightings.length > 0).length;
    report({
      stage: "ground_parts",
      state: "done",
      reused: grounded.reused,
      detail: `${found} of ${all.length} parts located`,
    });
  } else {
    report({ stage: "ground_parts", state: "skipped", detail: "No video to ground parts in" });
  }

  let diagramKeys: (string | null)[] = [];
  const { illustrator, media } = deps;
  if (illustrator && media && config.diagrams.enabled) {
    report({ stage: "draw_diagrams", state: "running" });
    const drawn = await runStage(
      diagramStage,
      {
        guideId: input.guideId,
        ...(isVideo ? { frameSource } : {}),
        steps: steps.map((s, i) => {
          const t = referenceTimesS[i]?.at(-1);
          return {
            title: s.title,
            instruction: s.instruction,
            parts: s.parts,
            ...(t === undefined ? {} : { referenceS: t }),
          };
        }),
      },
      { ...deps, illustrator, media },
      store,
    );
    artifacts.draw_diagrams = drawn.key;
    diagramKeys = drawn.output.keys;
    const count = diagramKeys.filter(Boolean).length;
    report({
      stage: "draw_diagrams",
      state: "done",
      reused: drawn.reused,
      detail: `${count} of ${steps.length} diagrams drawn`,
    });
  } else {
    report({ stage: "draw_diagrams", state: "skipped", detail: "Diagrams are off" });
  }

  let reviewed: { level: SafetyLevel; note?: string | undefined }[] = [];
  if (deps.auditor) {
    report({ stage: "review_safety", state: "running" });
    try {
      const review = await runStage(
        safetyStage,
        {
          title: input.source.title,
          steps: steps.map((s) => ({
            title: s.title,
            instruction: s.instruction,
            warning: s.warning,
          })),
        },
        { auditor: deps.auditor },
        store,
      );
      artifacts.review_safety = review.key;
      reviewed = review.output.steps;
      const flagged = reviewed.filter((r) => r.level !== "none").length;
      report({
        stage: "review_safety",
        state: "done",
        reused: review.reused,
        detail: `${flagged} of ${steps.length} steps need care`,
      });
    } catch {
      report({
        stage: "review_safety",
        state: "skipped",
        detail: "Safety review unavailable; using the draft's warnings",
      });
    }
  } else {
    report({ stage: "review_safety", state: "skipped", detail: "No safety reviewer configured" });
  }

  const guide = Guide.parse({
    id: input.guideId,
    title: input.source.title,
    status: "draft",
    source: input.source,
    version: options.version ?? 1,
    steps: steps.map((s, index) => ({
      index,
      title: s.title,
      instruction: s.instruction,
      startS: s.startS,
      endS: s.endS,
      doneWhen: s.doneWhen,
      ...(s.showMe ? { showMe: s.showMe } : {}),
      parts: parts[index] ?? [],
      referenceTimesS: referenceTimesS[index] ?? [],
      safety: mergeSafety(safetyOf(s), reviewed[index]),
      ...(diagramKeys[index] ? { diagramKey: diagramKeys[index] } : {}),
    })),
  });
  return { guide, boundaries, artifacts };
}
