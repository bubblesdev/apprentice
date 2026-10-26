import type { Box, Step } from "./guide.js";
import type { VerdictKind } from "./session.js";

/** Raw bytes plus a MIME type, or a reference to media already uploaded to a provider. */
export type Media =
  | { kind: "bytes"; mime: string; data: Uint8Array }
  | { kind: "provider_file"; fileId: string }
  | { kind: "url"; url: string };

/** One step as first drafted from a source, before boundary refinement. */
export interface StepDraft {
  title: string;
  instruction: string;
  startS: number;
  endS: number;
  parts: string[];
  doneWhen: string;
  warning?: string;
}

export interface StepJudgement {
  kind: VerdictKind;
  confidence: number;
  sentence: string;
}

/** Reads and watches instructions; judges a live step against the expert's reference. */
export interface VisionReasoner {
  draftSteps(source: Media, opts?: { documentText?: string }): Promise<StepDraft[]>;
  judgeStep(input: {
    step: Pick<Step, "title" | "instruction" | "doneWhen">;
    reference: Media[];
    live: Media[];
  }): Promise<StepJudgement>;
}

export interface Detection {
  objectId: number;
  box: Box;
  confidence?: number;
}

/** Finds and tracks a named concept. Frames are keyed by frame index. */
export interface Segmenter {
  trackInVideo(video: Media, concept: string): Promise<Map<number, Detection[]>>;
  findInImage(image: Media, concept: string): Promise<Detection[]>;
}

export interface Transcriber {
  transcribe(audio: Media): Promise<{ text: string }>;
}

export interface Illustrator {
  diagram(input: { instruction: string; reference: Media[] }): Promise<Media>;
}
