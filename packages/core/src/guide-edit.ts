import { z } from "zod";
import { Guide } from "./guide.js";

/**
 * An author's edit of a built guide. `steps` is the new order: each entry points at a step of
 * the current version (`from`), so edited steps keep their video times, reference frames and
 * grounded parts. Steps left out are deleted. New steps are not added here: a step needs
 * expert frames to be checked against.
 */
export const GuideEditRequest = z.object({
  /** The version the author started from; a stale edit is refused instead of overwriting. */
  version: z.number().int().positive(),
  title: z.string().trim().min(1).max(200).optional(),
  steps: z
    .array(
      z.object({
        from: z.number().int().nonnegative(),
        title: z.string().trim().min(1).max(200),
        instruction: z.string().trim().min(1).max(1000),
        doneWhen: z.string().trim().min(1).max(1000),
        /** Empty clears the note; the safety level is kept unless the note is cleared. */
        safetyNote: z.string().trim().max(500).optional(),
      }),
    )
    .min(1)
    .optional(),
});
export type GuideEditRequest = z.infer<typeof GuideEditRequest>;

export type GuideEditResult =
  | { ok: true; guide: Guide }
  | { ok: false; reason: "stale" | "building" | "invalid"; message: string };

/** Applies an edit, bumping the version. An approved guide goes back to draft for re-approval. */
export function applyGuideEdit(guide: Guide, edit: GuideEditRequest): GuideEditResult {
  if (guide.status === "building")
    return { ok: false, reason: "building", message: "This guide is still being built" };
  if (edit.version !== guide.version) {
    return {
      ok: false,
      reason: "stale",
      message: "This guide changed since you opened it. Reload and try again.",
    };
  }
  let steps = guide.steps;
  if (edit.steps) {
    const used = new Set<number>();
    const next = [];
    for (const [index, s] of edit.steps.entries()) {
      const original = guide.steps[s.from];
      if (!original || used.has(s.from)) {
        return {
          ok: false,
          reason: "invalid",
          message: `Step ${s.from + 1} is missing or listed twice`,
        };
      }
      used.add(s.from);
      const note = s.safetyNote === undefined ? original.safety.note : s.safetyNote || undefined;
      const level = s.safetyNote === "" ? "none" : original.safety.level;
      next.push({
        ...original,
        index,
        title: s.title,
        instruction: s.instruction,
        doneWhen: s.doneWhen,
        safety: note ? { level: level === "none" ? "caution" : level, note } : { level },
      });
    }
    steps = next;
  }
  const parsed = Guide.safeParse({
    ...guide,
    title: edit.title ?? guide.title,
    steps,
    status: "draft",
    version: guide.version + 1,
  });
  return parsed.success
    ? { ok: true, guide: parsed.data }
    : { ok: false, reason: "invalid", message: parsed.error.issues[0]?.message ?? "Invalid guide" };
}
