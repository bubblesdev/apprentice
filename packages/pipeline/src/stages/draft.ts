import { z } from "zod";
import type { PipelineDeps } from "../config.js";
import { MediaRef, StepDraftSchema } from "../schemas.js";
import type { Stage } from "../stage.js";

export interface DraftInput {
  media: MediaRef;
  documentText?: string;
}

export const DraftOutput = z.object({ steps: z.array(StepDraftSchema).min(1) });

/** Muse Spark watches the video with its audio (or reads the document) and drafts ordered steps. */
export const draftStage: Stage<DraftInput, typeof DraftOutput, PipelineDeps> = {
  name: "draft_steps",
  version: 1,
  output: DraftOutput,
  async run(input, deps) {
    const opts = input.documentText ? { documentText: input.documentText } : {};
    return { steps: await deps.reasoner.draftSteps(input.media, opts) };
  },
};
