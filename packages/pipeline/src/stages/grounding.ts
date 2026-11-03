import { PartRef } from "@apprentice/core";
import { z } from "zod";
import type { PipelineConfig, PipelineDeps } from "../config.js";
import { MediaRef } from "../schemas.js";
import type { Stage } from "../stage.js";

export interface GroundingInput {
  media: MediaRef;
  steps: { parts: string[]; referenceTimesS: number[] }[];
  config: PipelineConfig["grounding"];
}

export const GroundingOutput = z.object({ parts: z.array(z.array(PartRef)) });

/**
 * SAM 3.1 looks for each named part in the step's latest reference frames. Single images rather
 * than video tracking: spike 1 showed identities fragment over long clips, and an image call is
 * cheap ($0.0025). A part SAM cannot find keeps no sightings, and the coach then does not
 * require it to be visible.
 */
export const groundingStage: Stage<GroundingInput, typeof GroundingOutput, PipelineDeps> = {
  name: "ground_parts",
  version: 1,
  output: GroundingOutput,
  async run(input, deps) {
    const { framesPerPart, presenceConfidence } = input.config;
    const parts: z.input<typeof PartRef>[][] = [];
    for (const step of input.steps) {
      const times = step.referenceTimesS.slice(-framesPerPart);
      const frames = await Promise.all(
        times.map(async (t) => ({ t, media: await deps.frames.frameAt(input.media, t) })),
      );
      parts.push(
        await Promise.all(
          step.parts.map(async (name) => {
            const sightings = [];
            for (const frame of frames) {
              const best = (await deps.segmenter.findInImage(frame.media, name))
                .filter((d) => (d.confidence ?? 1) >= presenceConfidence)
                .sort((a, b) => (b.confidence ?? 1) - (a.confidence ?? 1))[0];
              if (best) sightings.push({ t: frame.t, box: best.box });
            }
            return { name, sightings };
          }),
        ),
      );
    }
    return { parts };
  },
};
