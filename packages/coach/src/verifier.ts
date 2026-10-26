import {
  BudgetExceededError,
  type Media,
  type Segmenter,
  type Step,
  type StepJudgement,
  type VisionReasoner,
} from "@apprentice/core";
import type { CoachPolicy } from "./policy.js";
import type { PartCheck, Sample, SampleError } from "./sample.js";

/** A live camera frame with the storage key it is kept under as evidence. */
export interface LiveFrame {
  key: string;
  media: Media;
}

export interface StepVerifierDeps {
  reasoner: VisionReasoner;
  /** Optional: without it, part presence is not checked. */
  segmenter?: Segmenter;
  policy: CoachPolicy;
}

function toSampleError(error: unknown): SampleError {
  if (error instanceof BudgetExceededError) return { kind: "budget", message: error.message };
  return { kind: "model", message: error instanceof Error ? error.message : String(error) };
}

const COULD_NOT_CHECK: StepJudgement = {
  kind: "unclear",
  confidence: 0,
  sentence: "I could not check these frames.",
};

/**
 * Turns a few live frames into one Sample: Muse Spark judges the step against the expert's
 * reference frames while SAM 3.1 checks that each grounded part is in view. Failures become
 * a sample with an error, so the policy asks for a closer look instead of guessing.
 */
export class StepVerifier {
  constructor(private readonly deps: StepVerifierDeps) {}

  /** Parts worth checking live: only those SAM could find in the expert's frames. */
  static groundedParts(step: Pick<Step, "parts">): string[] {
    return step.parts.filter((p) => p.sightings.length > 0).map((p) => p.name);
  }

  async sample(input: {
    step: Pick<Step, "title" | "instruction" | "doneWhen" | "parts">;
    reference: Media[];
    live: LiveFrame[];
  }): Promise<Sample> {
    const frames = input.live.slice(-this.deps.policy.framesPerSample);
    const frameKeys = frames.map((f) => f.key);
    const latest = frames.at(-1);
    if (!latest)
      return {
        judgement: COULD_NOT_CHECK,
        parts: [],
        frameKeys,
        error: { kind: "model", message: "No live frames" },
      };

    const brief = {
      title: input.step.title,
      instruction: input.step.instruction,
      doneWhen: input.step.doneWhen,
    };
    const [judged, parts] = await Promise.all([
      this.deps.reasoner
        .judgeStep({ step: brief, reference: input.reference, live: frames.map((f) => f.media) })
        .then((judgement) => ({ judgement }))
        .catch((error: unknown) => ({ judgement: COULD_NOT_CHECK, error: toSampleError(error) })),
      this.checkParts(StepVerifier.groundedParts(input.step), latest.media),
    ]);
    return { ...judged, parts, frameKeys };
  }

  private async checkParts(names: string[], image: Media): Promise<PartCheck[]> {
    const segmenter = this.deps.segmenter;
    if (!segmenter || !this.deps.policy.requirePartsPresent) return [];
    return Promise.all(
      names.map(async (name): Promise<PartCheck> => {
        try {
          const best = (await segmenter.findInImage(image, name))
            .map((d) => ({ box: d.box, confidence: d.confidence ?? 1 }))
            .sort((a, b) => b.confidence - a.confidence)[0];
          if (!best) return { name, present: false };
          return {
            name,
            present: best.confidence >= this.deps.policy.presenceConfidence,
            confidence: best.confidence,
            box: best.box,
          };
        } catch {
          // A failed presence check must never count as "present".
          return { name, present: false };
        }
      }),
    );
  }
}
