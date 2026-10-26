import { createHash } from "node:crypto";
import type { Illustrator, MediaStore } from "@apprentice/core";
import { z } from "zod";
import type { PipelineDeps } from "../config.js";
import type { MediaRef } from "../schemas.js";
import type { Stage } from "../stage.js";

export interface DiagramInput {
  guideId: string;
  /** Frames are taken from here; absent for written instructions. */
  frameSource?: MediaRef;
  steps: { title: string; instruction: string; parts: string[]; referenceS?: number }[];
}

/** One media key per step, or null when that step's diagram could not be drawn. */
export const DiagramOutput = z.object({ keys: z.array(z.string().nullable()) });

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export function diagramKey(guideId: string, index: number, mime: string, data: Uint8Array): string {
  const hash = createHash("sha256").update(data).digest("hex").slice(0, 12);
  return `guides/${guideId}/diagrams/${index + 1}-${hash}.${EXT[mime] ?? "png"}`;
}

type Deps = PipelineDeps & { illustrator: Illustrator; media: MediaStore };

/**
 * Muse Image draws a clean diagram per step from the expert's finished frame. Diagrams help but
 * are not required, so a failed step is recorded as null instead of failing the guide.
 */
export const diagramStage: Stage<DiagramInput, typeof DiagramOutput, Deps> = {
  name: "draw_diagrams",
  version: 1,
  output: DiagramOutput,
  async run(input, deps) {
    const keys: (string | null)[] = [];
    for (const [index, step] of input.steps.entries()) {
      try {
        const reference =
          input.frameSource && step.referenceS !== undefined
            ? [await deps.frames.frameAt(input.frameSource, step.referenceS)]
            : [];
        const image = await deps.illustrator.diagram({
          title: step.title,
          instruction: step.instruction,
          parts: step.parts,
          reference,
        });
        const key = diagramKey(input.guideId, index, image.mime, image.data);
        await deps.media.put(key, image.data, image.mime);
        keys.push(key);
      } catch {
        keys.push(null);
      }
    }
    return { keys };
  },
};
