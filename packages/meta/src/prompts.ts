import type { StepBrief } from "@apprentice/core";

/**
 * Prompts sent to Muse Spark. The text is part of every request body, so changing a prompt
 * changes the cache key and never replays an answer to an older prompt.
 */

const STEP_FIELDS =
  "For each step return start_s, end_s, title, instruction (one imperative sentence for a " +
  "beginner), parts_and_tools (short noun phrases), visible_check (what must be visible when " +
  "the step is done correctly), warning (empty if none), safety (none, caution, or stop when " +
  "the step involves mains electricity, gas, blades, heat or pressure) and check_view (empty " +
  "unless the finished state can only be seen from another side: then a short request such as " +
  '"Turn it over so I can see the bottom").';

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
    "angle. The expert's last image is the finished state: if the trainee's parts are in that " +
    "same state, say done, even when the work itself (a screw under the case, grease on a " +
    "hidden face) is out of view. Judge mainly by the trainee's latest image. If the trainee " +
    "is clearly past this step but there is no evidence this step was done, say skipped. If " +
    "their parts are clearly in an earlier state than the expert's finished image, say " +
    "not_yet. Say unclear only when the part that decides the step is hidden, blurred or out " +
    "of frame. Parts are judged by kind, position and orientation, not by brand or model: a part " +
    "of the same kind from another maker is fine. Say wrong only for the wrong kind of part, " +
    "the wrong place or the wrong way round. If you see an immediate danger (live " +
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

/** Muse Image: one calm, labelled line diagram per step, drawn from the expert's real frame. */
export function diagramPrompt(
  step: { title: string; instruction: string; parts: string[] },
  hasReference: boolean,
): string {
  return (
    "Draw a clean instructional diagram for one step of a hands-on job. " +
    `Step: ${step.title}. ${step.instruction} ` +
    (step.parts.length
      ? `Label these parts with short leader lines: ${step.parts.join(", ")}. `
      : "") +
    (hasReference
      ? "Base the layout and the objects on the attached photo of the finished step. "
      : "") +
    "Style: flat line art, white strokes on a near-black background, one soft blue accent on the " +
    "part being worked on, generous space, no shading, no people's faces, no brand logos, and no " +
    "text other than the part labels."
  );
}

/** A trainee asks about the current step while their hands are busy. */
export function answerPrompt(step: StepBrief, question: string, hasFrame: boolean): string {
  return (
    "You are a calm, expert workshop instructor coaching a beginner through one step of a " +
    `hands-on job. The current step is:\n${JSON.stringify(step)}\n` +
    (hasFrame ? "The image shows the beginner's work right now. " : "") +
    `The beginner asks: ${JSON.stringify(question)}\n` +
    "Answer in at most two short sentences they can follow without looking away from the work. " +
    "If what they describe or what you see is unsafe, tell them to stop first. If the question is " +
    "not about this job, say you can only help with this step. Plain text only."
  );
}

/** Muse Wonder reviews every step of a drafted guide for hazards. */
export function safetyReviewPrompt(
  title: string,
  steps: { title: string; instruction: string; warning?: string | undefined }[],
): string {
  return (
    "You are a careful workshop safety reviewer. A beginner will follow this guide while a coach " +
    `watches through a phone camera. Guide: ${JSON.stringify(title)}. Steps, in order:\n` +
    JSON.stringify(steps.map((s, i) => ({ step: i + 1, ...s }))) +
    "\nFor every step, in the same order, give a safety level: stop when the step involves mains " +
    "electricity, gas, blades, heat, pressure or harmful chemicals and the beginner must confirm a " +
    "precaution first; caution only when this step itself has a real risk a beginner might miss " +
    "(sharp metal edges, springs, small parts that can be lost, a real pinch point); none for " +
    "looking, lifting, placing or sliding ordinary parts. Give a short imperative note for stop and caution (for example: Unplug the console " +
    'first). JSON only: {"steps":[{"level":"none|caution|stop","note":"..."}]}'
  );
}

/** Muse Wonder reads a finished run and writes the supervisor's review. */
export function runAuditPrompt(input: {
  title: string;
  steps: { title: string; doneWhen: string }[];
  report: unknown;
}): string {
  return (
    "You are a senior technician reviewing a trainee's run of a hands-on job, using only the " +
    `coach's evidence. Guide: ${JSON.stringify(input.title)}. Steps: ${JSON.stringify(input.steps)}. ` +
    `Run report (verdicts, caught mistakes, closer requests, unverified steps): ${JSON.stringify(input.report)}.\n` +
    "Write: summary (two plain sentences on how the job went), concerns (steps a supervisor should " +
    "check: unverified steps, mistakes caught late, anything unsafe), and suggestions (how to reword " +
    "a step so the next trainee gets it right, only where the run shows trouble). Use 0-based step " +
    'indexes. JSON only: {"summary":"...","concerns":[{"stepIndex":0,"note":"..."}],' +
    '"suggestions":[{"stepIndex":0,"suggestion":"..."}]}'
  );
}
