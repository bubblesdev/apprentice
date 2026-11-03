import { pathToFileURL } from "node:url";
import {
  BudgetExceededError,
  type FrameExtractor,
  type Media,
  type VisionReasoner,
} from "@apprentice/core";
import type { LabelledCase, LabelledRun } from "./labelled.js";
import type { EvalSet } from "./sets.js";

export interface RunDeps {
  reasoner: VisionReasoner;
  frames: FrameExtractor;
  onCase?: (done: number, total: number, c: LabelledCase) => void;
}

export interface RunOutcome {
  run: LabelledRun;
  judged: number;
  errors: number;
  /** The budget ran out; the run holds the cases judged before that. */
  stoppedEarly: boolean;
}

const asMedia = (path: string): Media =>
  /^[a-z]+:\/\//i.test(path)
    ? { kind: "url", url: path }
    : { kind: "url", url: pathToFileURL(path).href };

/**
 * Judges every case exactly as the live coach would: the step's text, the expert's reference
 * frames, and the trainee frames, through the same VisionReasoner.judgeStep. A failed call is
 * recorded as an unclear verdict with confidence 0 (the coach would ask to see closer).
 */
export async function runEvalSet(set: EvalSet, deps: RunDeps): Promise<RunOutcome> {
  const expert = asMedia(set.expertVideo);
  const trainee = asMedia(set.traineeVideo);
  const references = new Map<number, Promise<Media[]>>();
  const referenceFor = (stepIndex: number) => {
    let refs = references.get(stepIndex);
    if (!refs) {
      const times = set.guide.steps[stepIndex]?.referenceTimesS ?? [];
      refs = Promise.all(times.map((t) => deps.frames.frameAt(expert, t)));
      references.set(stepIndex, refs);
    }
    return refs;
  };

  const cases: LabelledCase[] = [];
  let errors = 0;
  let stoppedEarly = false;
  for (const c of set.cases) {
    const step = set.guide.steps[c.stepIndex];
    if (!step) continue;
    let predicted: LabelledCase["predicted"];
    try {
      const [reference, live] = await Promise.all([
        referenceFor(c.stepIndex),
        Promise.all(c.frameTimesS.map((t) => deps.frames.frameAt(trainee, t))),
      ]);
      const j = await deps.reasoner.judgeStep({
        step: { title: step.title, instruction: step.instruction, doneWhen: step.doneWhen },
        reference,
        live,
      });
      predicted = { kind: j.kind, confidence: j.confidence, sentence: j.sentence };
    } catch (error) {
      if (error instanceof BudgetExceededError) {
        stoppedEarly = true;
        break;
      }
      errors++;
      predicted = {
        kind: "unclear",
        confidence: 0,
        sentence: `Error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    const labelled: LabelledCase = {
      id: c.id,
      stepIndex: c.stepIndex,
      label: c.label,
      origin: c.origin,
      predicted,
    };
    cases.push(labelled);
    deps.onCase?.(cases.length, set.cases.length, labelled);
  }
  if (cases.length === 0)
    throw new Error(stoppedEarly ? "The budget ran out before the first case" : "No cases to run");
  return {
    run: { name: set.name, description: `${set.guide.title}: ${cases.length} cases`, cases },
    judged: cases.length - errors,
    errors,
    stoppedEarly,
  };
}
