import type { Box, SafetyLevel, Step } from "./guide.js";
import type { RunAudit, RunReport } from "./api.js";
import type { VerdictKind } from "./session.js";

/** Raw bytes plus a MIME type, or a reference to media already uploaded to a provider. */
export type Media =
  | { kind: "bytes"; mime: string; data: Uint8Array }
  | { kind: "provider_file"; fileId: string; mime?: string | undefined }
  | { kind: "url"; url: string; mime?: string | undefined };

/** One step as first drafted from a source, before boundary refinement. */
export interface StepDraft {
  title: string;
  instruction: string;
  startS: number;
  endS: number;
  parts: string[];
  doneWhen: string;
  warning?: string | undefined;
  /** A request for the view that shows the finished state, when the usual view cannot. */
  showMe?: string | undefined;
  /** The model's own safety call; the pipeline falls back to "caution" when only a warning exists. */
  safety?: SafetyLevel | undefined;
}

export interface StepJudgement {
  kind: VerdictKind;
  confidence: number;
  sentence: string;
}

/** The text a model needs to reason about one step. */
export type StepBrief = Pick<Step, "title" | "instruction" | "doneWhen">;

/** A frame of the source with its time, used for dense boundary checks. */
export interface TimedFrame {
  t: number;
  media: Media;
}

export interface BoundaryEstimate {
  /** Time at which the step's finished state is first clearly visible, or null if no frame shows it. */
  endS: number | null;
  confidence: number;
  sentence: string;
}

/** Reads and watches instructions; judges a live step against the expert's reference. */
export interface VisionReasoner {
  /** `pages` are photos of a printed manual, read in order; they take priority over `source`. */
  draftSteps(
    source: Media,
    opts?: { documentText?: string; pages?: Media[] },
  ): Promise<StepDraft[]>;
  /** Picks the frame where `step` is finished, from dense frames around its drafted end. */
  refineBoundary(input: {
    step: StepBrief;
    next?: StepBrief;
    frames: TimedFrame[];
  }): Promise<BoundaryEstimate>;
  judgeStep(input: { step: StepBrief; reference: Media[]; live: Media[] }): Promise<StepJudgement>;
  /** Answers a trainee's question about the current step, optionally looking at their latest frame. */
  answer(input: { step: StepBrief; question: string; live: Media[] }): Promise<{ answer: string }>;
}

export interface Detection {
  objectId: number;
  box: Box;
  confidence?: number;
}

/** Finds and tracks a named concept. Frames are keyed by frame index. */
export interface Segmenter {
  trackInVideo(
    video: Media,
    concept: string,
    opts?: { frameCount?: number },
  ): Promise<Map<number, Detection[]>>;
  findInImage(image: Media, concept: string): Promise<Detection[]>;
}

export interface Transcriber {
  transcribe(audio: Media): Promise<{ text: string }>;
}

/** A clean step diagram (Muse Image). Returns image bytes ready to store. */
export interface Illustrator {
  diagram(input: {
    title: string;
    instruction: string;
    parts: string[];
    /** Expert frames of the finished step; empty for written instructions. */
    reference: Media[];
  }): Promise<{ kind: "bytes"; mime: string; data: Uint8Array }>;
}

/** Pulls still frames out of a source video (ffmpeg in the worker, a fixture in tests). */
export interface FrameExtractor {
  frameAt(video: Media, t: number): Promise<Media>;
}

export interface SafetyCall {
  level: SafetyLevel;
  note?: string | undefined;
}

/** Muse Wonder: safety review of a drafted guide, and an audit of a finished run. */
export interface Auditor {
  reviewSafety(input: {
    title: string;
    steps: { title: string; instruction: string; warning?: string | undefined }[];
  }): Promise<SafetyCall[]>;
  auditRun(input: {
    title: string;
    steps: { title: string; doneWhen: string }[];
    report: RunReport;
  }): Promise<RunAudit>;
}
