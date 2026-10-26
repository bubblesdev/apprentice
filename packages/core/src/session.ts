import { z } from "zod";
import { Box } from "./guide.js";

/** What the verifier concluded about the current step. */
export const VerdictKind = z.enum(["done", "not_yet", "wrong", "skipped", "unclear", "unsafe"]);
export type VerdictKind = z.infer<typeof VerdictKind>;

/** Proof attached to a verdict: frames, boxes and the model's sentence. */
export const Evidence = z.object({
  frameKeys: z.array(z.string()).default([]),
  boxes: z.array(z.object({ label: z.string(), box: Box })).default([]),
  sentence: z.string().min(1),
});
export type Evidence = z.infer<typeof Evidence>;

/** Who settled a verdict: the coach policy from model evidence, or the trainee overriding it. */
export const VerdictSource = z.enum(["policy", "trainee"]);
export type VerdictSource = z.infer<typeof VerdictSource>;

export const Verdict = z.object({
  stepIndex: z.number().int().nonnegative(),
  kind: VerdictKind,
  decidedBy: VerdictSource.default("policy"),
  confidence: z.number().min(0).max(1),
  evidence: Evidence,
  at: z.string().datetime(),
});
export type Verdict = z.infer<typeof Verdict>;

/** Coach states. See docs/ARCHITECTURE.md, "Coach state machine". */
export const CoachState = z.enum([
  "briefing",
  "doing",
  "verifying",
  "passed",
  "closer",
  "retry",
  "blocked",
  "complete",
]);
export type CoachState = z.infer<typeof CoachState>;

export const Session = z.object({
  id: z.string().min(1),
  guideId: z.string().min(1),
  guideVersion: z.number().int().positive(),
  state: CoachState,
  stepIndex: z.number().int().nonnegative(),
  verdicts: z.array(Verdict).default([]),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
});
export type Session = z.infer<typeof Session>;
