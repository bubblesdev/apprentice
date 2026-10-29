import type { z } from "zod";
import { ModelOutputError } from "./errors.js";

/**
 * Pulls the outermost JSON object out of a model reply (models sometimes wrap it in prose or a
 * code fence) and validates it. Throws ModelOutputError instead of returning partial data.
 */
export function parseModelJson<T extends z.ZodTypeAny>(text: string, schema: T): z.output<T> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new ModelOutputError("No JSON object in model output", text);
  let value: unknown;
  try {
    value = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new ModelOutputError("Model output is not valid JSON", text);
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ModelOutputError(`Model output failed validation (${parsed.error.message})`, text);
  }
  return parsed.data;
}
