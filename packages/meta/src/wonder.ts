import {
  SafetyLevel,
  type Auditor,
  type RunAudit,
  type RunReport,
  type SafetyCall,
} from "@apprentice/core";
import { z } from "zod";
import type { ResponsesApi } from "./client.js";
import { ModelOutputError } from "./errors.js";
import { parseModelJson } from "./json.js";
import { textPart, userTurn } from "./media.js";
import type { CostMeter } from "./meter.js";
import { runAuditPrompt, safetyReviewPrompt } from "./prompts.js";

export const MUSE_WONDER = "muse-wonder-1.0";

const SafetyOutput = z.object({
  steps: z.array(z.object({ level: SafetyLevel, note: z.string().optional() })),
});

const AuditOutput = z.object({
  summary: z.string().min(1),
  concerns: z
    .array(z.object({ stepIndex: z.coerce.number().int().nonnegative(), note: z.string().min(1) }))
    .default([]),
  suggestions: z
    .array(
      z.object({ stepIndex: z.coerce.number().int().nonnegative(), suggestion: z.string().min(1) }),
    )
    .default([]),
});

export interface WonderAuditorOptions {
  api: ResponsesApi;
  meter?: CostMeter;
  model?: string;
}

/** Auditor on Muse Wonder, Meta's strongest reasoning model; used where judgement matters most. */
export class WonderAuditor implements Auditor {
  private readonly model: string;

  constructor(private readonly options: WonderAuditorOptions) {
    this.model = options.model ?? MUSE_WONDER;
  }

  private async call(operation: string, prompt: string): Promise<string> {
    this.options.meter?.assertWithinBudget();
    const result = await this.options.api.createResponse({
      model: this.model,
      input: userTurn([textPart(prompt)]),
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
    return result.text;
  }

  async reviewSafety(input: Parameters<Auditor["reviewSafety"]>[0]): Promise<SafetyCall[]> {
    const text = await this.call("review_safety", safetyReviewPrompt(input.title, input.steps));
    const { steps } = parseModelJson(text, SafetyOutput);
    if (steps.length !== input.steps.length) {
      throw new ModelOutputError(
        `Safety review covered ${steps.length} of ${input.steps.length} steps`,
        text,
      );
    }
    return steps.map((s) =>
      s.note?.trim() ? { level: s.level, note: s.note.trim() } : { level: s.level },
    );
  }

  async auditRun(input: {
    title: string;
    steps: { title: string; doneWhen: string }[];
    report: RunReport;
  }): Promise<RunAudit> {
    const text = await this.call("audit_run", runAuditPrompt(input));
    const out = parseModelJson(text, AuditOutput);
    const inRange = (i: number) => i < input.steps.length;
    return {
      summary: out.summary,
      concerns: out.concerns.filter((c) => inRange(c.stepIndex)),
      suggestions: out.suggestions.filter((s) => inRange(s.stepIndex)),
      source: "model",
    };
  }
}
