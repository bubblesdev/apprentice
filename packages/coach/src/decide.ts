import type { CoachPolicy } from "./policy.js";
import type { Sample } from "./sample.js";

export type CloserReason =
  "low_confidence" | "parts_missing" | "unclear" | "model_error" | "unavailable";

/** What the policy concluded from the samples taken since the trainee asked for a check. */
export type Decision =
  | { kind: "pass"; confidence: number; sentence: string; samples: Sample[] }
  | { kind: "confirming"; agreeing: number; needed: number; sentence: string }
  | { kind: "closer"; reason: CloserReason; missingParts: string[]; sentence: string }
  | { kind: "retry"; verdict: "wrong" | "skipped"; confidence: number; sentence: string }
  | { kind: "not_yet"; confidence: number; sentence: string }
  | { kind: "stop"; confidence: number; sentence: string };

function missingParts(sample: Sample, policy: CoachPolicy): string[] {
  if (!policy.requirePartsPresent) return [];
  return sample.parts
    .filter((p) => !p.present || (p.confidence ?? 1) < policy.presenceConfidence)
    .map((p) => p.name);
}

/** A sample that would count towards a pass on its own. */
function qualifies(sample: Sample, policy: CoachPolicy): boolean {
  return (
    !sample.error &&
    sample.judgement.kind === "done" &&
    sample.judgement.confidence >= policy.passConfidence &&
    missingParts(sample, policy).length === 0
  );
}

/**
 * The deterministic half of "the model proposes, policy decides" (ADR 0003). Only the latest
 * sample can change the outcome; earlier ones matter only as the run of agreeing passes.
 * Safety first: a confident `unsafe` stops at once, and nothing weaker than the pass rule
 * ever advances a step.
 */
export function decide(samples: readonly Sample[], policy: CoachPolicy): Decision {
  const latest = samples.at(-1);
  if (!latest) {
    return {
      kind: "closer",
      reason: "unclear",
      missingParts: [],
      sentence: "No frames to check yet.",
    };
  }
  const { kind, confidence, sentence } = latest.judgement;
  const closer = (reason: CloserReason, missing: string[] = []): Decision => ({
    kind: "closer",
    reason,
    missingParts: missing,
    sentence,
  });

  if (latest.error) return closer(latest.error.kind === "budget" ? "unavailable" : "model_error");

  switch (kind) {
    case "unsafe":
      return confidence >= policy.stopConfidence
        ? { kind: "stop", confidence, sentence }
        : closer("low_confidence");
    case "wrong":
    case "skipped":
      return confidence >= policy.retryConfidence
        ? { kind: "retry", verdict: kind, confidence, sentence }
        : closer("low_confidence");
    case "not_yet":
      return confidence >= policy.retryConfidence
        ? { kind: "not_yet", confidence, sentence }
        : closer("low_confidence");
    case "unclear":
      return closer("unclear");
    case "done": {
      if (confidence < policy.passConfidence) return closer("low_confidence");
      const missing = missingParts(latest, policy);
      if (missing.length > 0) return closer("parts_missing", missing);
      let run = 0;
      for (let i = samples.length - 1; i >= 0; i--) {
        const sample = samples[i];
        if (!sample || !qualifies(sample, policy)) break;
        run++;
      }
      if (run < policy.agreeingSamples) {
        return { kind: "confirming", agreeing: run, needed: policy.agreeingSamples, sentence };
      }
      const agreeing = samples.slice(-run);
      return {
        kind: "pass",
        confidence: Math.min(...agreeing.map((s) => s.judgement.confidence)),
        sentence,
        samples: agreeing,
      };
    }
  }
}
