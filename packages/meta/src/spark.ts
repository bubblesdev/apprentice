import type {
  BoundaryEstimate,
  Media,
  StepBrief,
  StepDraft,
  StepJudgement,
  TimedFrame,
  VisionReasoner,
} from "@apprentice/core";
import type { FilesApi, ResponseResult, ResponsesApi } from "./client.js";
import { ModelOutputError } from "./errors.js";
import { parseModelJson } from "./json.js";
import { imagePart, textPart, userTurn, videoPart, type ContentPart } from "./media.js";
import type { CostMeter } from "./meter.js";
import {
  DRAFT_FROM_VIDEO_PROMPT,
  draftFromDocumentPrompt,
  answerPrompt,
  judgeStepPrompt,
  refineBoundaryPrompt,
} from "./prompts.js";
import { SparkBoundary, SparkJudgement, SparkStepsOutput, toStepDrafts } from "./spark-output.js";

export const MUSE_SPARK = "muse-spark-1.3";

export interface SparkReasonerOptions {
  api: ResponsesApi;
  /** Needed only to upload raw video bytes. */
  files?: FilesApi;
  meter?: CostMeter;
  model?: string;
}

/** VisionReasoner on Muse Spark: drafts steps from a video or document, refines boundaries, judges steps. */
export class SparkReasoner implements VisionReasoner {
  private readonly model: string;

  constructor(private readonly options: SparkReasonerOptions) {
    this.model = options.model ?? MUSE_SPARK;
  }

  private async call(operation: string, content: ContentPart[]): Promise<ResponseResult> {
    this.options.meter?.assertWithinBudget();
    const result = await this.options.api.createResponse({
      model: this.model,
      input: userTurn(content),
    });
    this.options.meter?.record(
      operation,
      {
        unit: "tokens",
        model: this.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
      result.cached === true,
    );
    return result;
  }

  async draftSteps(source: Media, opts: { documentText?: string } = {}): Promise<StepDraft[]> {
    const content = opts.documentText
      ? [textPart(draftFromDocumentPrompt(opts.documentText))]
      : [textPart(DRAFT_FROM_VIDEO_PROMPT), await videoPart(source, this.options.files)];
    const { text } = await this.call("draft_steps", content);
    return toStepDrafts(parseModelJson(text, SparkStepsOutput).steps);
  }

  async refineBoundary(input: {
    step: StepBrief;
    next?: StepBrief;
    frames: TimedFrame[];
  }): Promise<BoundaryEstimate> {
    const frames = [...input.frames].sort((a, b) => a.t - b.t);
    if (frames.length === 0) return { endS: null, confidence: 0, sentence: "No frames to check." };
    const times = frames.map((f) => f.t);
    const content: ContentPart[] = [textPart(refineBoundaryPrompt(input.step, input.next, times))];
    for (const frame of frames) content.push(textPart(`t=${frame.t}s`), imagePart(frame.media));
    const { text } = await this.call("refine_boundary", content);
    const out = parseModelJson(text, SparkBoundary);
    return {
      endS: out.end_s === null ? null : nearest(times, out.end_s),
      confidence: out.confidence,
      sentence: out.evidence,
    };
  }

  async judgeStep(input: {
    step: StepBrief;
    reference: Media[];
    live: Media[];
  }): Promise<StepJudgement> {
    const content: ContentPart[] = [
      textPart(judgeStepPrompt(input.step, input.reference.length, input.live.length)),
      ...input.reference.map(imagePart),
      ...input.live.map(imagePart),
    ];
    const { text } = await this.call("judge_step", content);
    const out = parseModelJson(text, SparkJudgement);
    return { kind: out.verdict, confidence: out.confidence, sentence: out.evidence };
  }

  async answer(input: {
    step: StepBrief;
    question: string;
    live: Media[];
  }): Promise<{ answer: string }> {
    const frame = input.live.at(-1);
    const content: ContentPart[] = [
      textPart(answerPrompt(input.step, input.question, frame !== undefined)),
      ...(frame ? [imagePart(frame)] : []),
    ];
    const { text } = await this.call("answer_question", content);
    const answer = text.trim().slice(0, 600);
    if (!answer) throw new ModelOutputError("Empty answer", text);
    return { answer };
  }
}

/** Snaps a model-reported time to the closest frame it was actually shown. */
function nearest(times: number[], t: number): number {
  return times.reduce((best, x) => (Math.abs(x - t) < Math.abs(best - t) ? x : best));
}
