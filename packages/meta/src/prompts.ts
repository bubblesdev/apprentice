import type { StepBrief } from "@apprentice/core";

/**
 * Prompts sent to Muse Spark. The text is part of every request body, so changing a prompt
 * changes the cache key and never replays an answer to an older prompt.
 */

const STEP_FIELDS =
  "For each step return start_s, end_s, title, instruction (one imperative sentence for a " +
  "beginner), parts_and_tools (short noun phrases), visible_check (what must be visible when " +
  "the step is done correctly), warning (empty if none) and safety (none, caution, or stop when " +
  "the step involves mains electricity, gas, blades, heat or pressure).";

/** From spike 1, extended with instruction and safety fields. */
export const DRAFT_FROM_VIDEO_PROMPT =
  "You are documenting a hands-on job from this video (frames and audio). Split it into the " +
  `ordered steps a beginner must follow. ${STEP_FIELDS} Reply with JSON only: {"steps":[...]}`;

export function draftFromDocumentPrompt(documentText: string): string {
  return (
    "You are turning written instructions for a hands-on job into the ordered steps a beginner " +
    `must follow. ${STEP_FIELDS} The source is text, so set start_s and end_s to 0. ` +
    `Reply with JSON only: {"steps":[...]}\n\nInstructions:\n${documentText}`
  );
}

/**
 * The strict-instructor judge from spike/step_check.py. Two verdicts were added for the live
 * coach: `unclear` (ask the trainee to show the part closer) and `unsafe` (stop them).
 */
export function judgeStepPrompt(
  step: StepBrief,
  referenceCount: number,
  liveCount: number,
): string {
  return (
    "You are a strict workshop instructor. The expert's step is:\n" +
    JSON.stringify(step) +
    `\nThe first ${referenceCount} images show the EXPERT during and at the end of this step. ` +
    `The last ${liveCount} images show the TRAINEE right now. Decide whether the trainee has ` +
    "completed THIS step correctly. Compare the state of the parts, not the hands or camera " +
    "angle. If the trainee is clearly past this step but there is no evidence this step was " +
    "done, say skipped. If they have not reached it, say not_yet. If the frames do not show " +
    "the parts clearly enough to decide, say unclear. If you see an immediate danger (live " +
    "mains wiring, a hand in the path of a blade, a powered appliance being opened), say " +
    'unsafe. JSON only: {"verdict":"done|skipped|not_yet|wrong|unclear|unsafe",' +
    '"confidence":0-1,"evidence":"one sentence naming what you saw"}'
  );
}

export function refineBoundaryPrompt(
  step: StepBrief,
  next: StepBrief | undefined,
  times: number[],
): string {
  return (
    "You are finding exactly when a step of a hands-on job is finished in the expert's video. " +
    `The step is:\n${JSON.stringify(step)}\n` +
    (next ? `The next step is:\n${JSON.stringify(next)}\n` : "") +
    `The images are frames at these times in seconds, in order: ${times.join(", ")}. ` +
    "Each image is preceded by its time. Return the earliest time at which the step's finished " +
    "state is clearly visible and the next step has not started. If no frame shows it, return " +
    'null. JSON only: {"end_s":number|null,"confidence":0-1,"evidence":"one sentence"}'
  );
}
