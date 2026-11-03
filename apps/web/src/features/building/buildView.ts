import type { BuildStage, BuildStatus, Guide } from "@apprentice/core";

export type RowState = "done" | "active" | "pending" | "skipped";

export interface BuildRow {
  stage: BuildStage["stage"];
  label: string;
  detail: string;
  model: string;
  state: RowState;
}

/** The pipeline's real stages, in order, with the Meta model doing each. */
const STAGES: {
  stage: BuildStage["stage"];
  label: string;
  documentLabel?: string;
  detail: string;
  model: string;
}[] = [
  {
    stage: "draft_steps",
    label: "Watching the video",
    documentLabel: "Reading the instructions",
    detail: "Splitting the job into ordered steps",
    model: "Muse Spark",
  },
  {
    stage: "refine_boundaries",
    label: "Finding where each step ends",
    detail: "Dense frames around every step's end",
    model: "Muse Spark",
  },
  {
    stage: "reference_frames",
    label: "Choosing expert frames",
    detail: "The finished state of each step",
    model: "",
  },
  {
    stage: "ground_parts",
    label: "Locating parts and tools",
    detail: "Highlighting each part in the expert frames",
    model: "SAM 3.1",
  },
  {
    stage: "draw_diagrams",
    label: "Drawing step diagrams",
    detail: "One clean diagram per step",
    model: "Muse Image",
  },
  {
    stage: "review_safety",
    label: "Safety check",
    detail: "Every step reviewed for hazards",
    model: "Muse Wonder",
  },
];

export type BuildPhase = "building" | "ready" | "failed";

export function buildPhase(guide: Guide | undefined, status: BuildStatus | undefined): BuildPhase {
  if (guide && guide.status !== "building") return "ready";
  return status?.error ? "failed" : "building";
}

export function buildRows(
  status: BuildStatus | undefined,
  phase: BuildPhase,
  isDocument: boolean,
): BuildRow[] {
  let activeTaken = phase !== "building";
  return STAGES.map((s) => {
    const reported = status?.stages.find((x) => x.stage === s.stage);
    let state: RowState;
    if (reported?.state === "done" || phase === "ready")
      state = reported?.state === "skipped" ? "skipped" : "done";
    else if (reported?.state === "skipped") state = "skipped";
    else if (!activeTaken) {
      state = "active";
      activeTaken = true;
    } else state = "pending";
    return {
      stage: s.stage,
      label: isDocument && s.documentLabel ? s.documentLabel : s.label,
      detail: reported?.detail ?? s.detail,
      model: s.model,
      state,
    };
  });
}
