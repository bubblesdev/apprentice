import { SafetyLevel, Source } from "@apprentice/core";
import { z } from "zod";

/**
 * Media the pipeline can hash and store: an uploaded provider file or a URL. Raw bytes are
 * uploaded by the ingest step before the pipeline starts.
 */
export const MediaRef = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("provider_file"),
    fileId: z.string().min(1),
    mime: z.string().optional(),
  }),
  z.object({ kind: z.literal("url"), url: z.string().min(1), mime: z.string().optional() }),
]);
export type MediaRef = z.infer<typeof MediaRef>;

export const StepDraftSchema = z.object({
  title: z.string().min(1),
  instruction: z.string().min(1),
  startS: z.number().nonnegative(),
  endS: z.number().nonnegative(),
  parts: z.array(z.string()),
  doneWhen: z.string().min(1),
  warning: z.string().optional(),
  showMe: z.string().optional(),
  safety: SafetyLevel.optional(),
});

export const PipelineInput = z.object({
  guideId: z.string().min(1),
  source: Source,
  /** The source video (or document file) as the models see it. */
  media: MediaRef,
  /** Where frames are extracted from (a local file for ffmpeg) when it differs from `media`. */
  frameSource: MediaRef.optional(),
  /** Extracted text for document sources; when present, steps are drafted from text. */
  documentText: z.string().optional(),
  /** Photos of printed manual pages; when present, steps are drafted from them. */
  pages: z.array(MediaRef).min(1).optional(),
});
export type PipelineInput = z.infer<typeof PipelineInput>;
