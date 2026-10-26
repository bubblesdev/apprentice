import type {
  BoundaryEstimate,
  Media,
  StepBrief,
  StepDraft,
  StepJudgement,
  TimedFrame,
  VisionReasoner,
} from "@apprentice/core";
import { parseFixtureMedia } from "./fixture-media.js";
import { JudgeCase, type JobFixture } from "./fixtures.js";

export type FakeOperation = "draft_steps" | "refine_boundary" | "judge_step" | "answer_question";

export interface FakeReasonerOptions {
  fixture: JobFixture;
  /** Boundary answers by step title. Spike 1 recorded none, so the default is "not found". */
  boundaries?: Record<string, BoundaryEstimate>;
  /** Scripted judgements for coach tests; return undefined to fall back to the recording. */
  judge?: (input: { step: StepBrief; live: Media[] }) => StepJudgement | undefined;
}

const NOT_RECORDED: StepJudgement = {
  kind: "unclear",
  confidence: 0,
  sentence: "No recorded verdict for these frames.",
};

/**
 * VisionReasoner that replays Muse Spark outputs recorded in fixtures/. No network, no cost.
 * Calls are logged so tests can prove that cached pipeline stages are not re-run.
 */
export class FakeReasoner implements VisionReasoner {
  readonly calls: FakeOperation[] = [];

  constructor(private readonly options: FakeReasonerOptions) {}

  async draftSteps(): Promise<StepDraft[]> {
    this.calls.push("draft_steps");
    return this.options.fixture.steps.map((s) => ({ ...s, parts: [...s.parts] }));
  }

  async refineBoundary(input: {
    step: StepBrief;
    frames: TimedFrame[];
  }): Promise<BoundaryEstimate> {
    this.calls.push("refine_boundary");
    return (
      this.options.boundaries?.[input.step.title] ?? {
        endS: null,
        confidence: 0,
        sentence: "No recorded boundary for this step.",
      }
    );
  }

  async judgeStep(input: {
    step: StepBrief;
    reference: Media[];
    live: Media[];
  }): Promise<StepJudgement> {
    this.calls.push("judge_step");
    const scripted = this.options.judge?.(input);
    if (scripted) return scripted;
    for (const media of input.live) {
      const ref = parseFixtureMedia(media);
      if (ref?.kind !== "trainee") continue;
      const step = Number(ref.params.get("step"));
      const judgeCase = JudgeCase.safeParse(ref.params.get("case"));
      if (!judgeCase.success) continue;
      const row = this.options.fixture.judgements.find(
        (j) => j.step === step && j.case === judgeCase.data,
      );
      if (row) return { kind: row.verdict, confidence: row.confidence, sentence: row.evidence };
    }
    return NOT_RECORDED;
  }

  /** No recorded answers exist: says so, and points at the step's own "done when" text. */
  async answer(input: { step: StepBrief; question: string }): Promise<{ answer: string }> {
    this.calls.push("answer_question");
    return {
      answer: `Development mode, no model was called. This step is done when: ${input.step.doneWhen}`,
    };
  }
}
