import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { VerdictKind, type StepDraft } from "@apprentice/core";
import { z } from "zod";
import { SparkStep, toStepDrafts } from "../spark-output.js";

/** spike 1 output: Spark's step split plus SAM tracking summaries (no per-frame boxes). */
const StepsAndSamFile = z.object({
  source: z.object({
    title: z.string(),
    attribution: z.string(),
    durationS: z.number().positive(),
    fps: z.number().positive(),
  }),
  sam: z.record(
    z.object({
      frames_with_hits: z.number().int().nonnegative(),
      distinct_ids: z.array(z.number().int()),
      seconds: z.number().nonnegative(),
    }),
  ),
  steps: z.array(SparkStep).min(1),
});

/** spike 2 run A: three cases per step, with the judge's confidence and evidence. */
export const JudgeCase = z.enum(["correct", "skipped", "earlier"]);
export type JudgeCase = z.infer<typeof JudgeCase>;

const RunAFile = z.object({
  rows: z.array(
    z.object({
      step: z.number().int().positive(),
      title: z.string(),
      case: JudgeCase,
      expected: VerdictKind,
      verdict: VerdictKind,
      confidence: z.number().min(0).max(1),
      evidence: z.string(),
    }),
  ),
});

/** spike 2 run B: "is this step finished?" at the start and end of each step; verdicts only. */
export const FinishCase = z.enum(["finished", "just_started"]);
export type FinishCase = z.infer<typeof FinishCase>;

const RunBFile = z.array(
  z.object({ step: z.number().int().positive(), case: FinishCase, verdict: VerdictKind }),
);

export interface RecordedJudgement {
  /** 1-based, as in the spike output. */
  step: number;
  case: JudgeCase;
  expected: VerdictKind;
  verdict: VerdictKind;
  confidence: number;
  evidence: string;
}

export interface RecordedFinishCheck {
  step: number;
  case: FinishCase;
  verdict: VerdictKind;
}

export interface JobFixture {
  job: string;
  source: { title: string; attribution: string; durationS: number; fps: number };
  steps: StepDraft[];
  /** Concepts SAM 3.1 tracked through the source, with frames hit and distinct ids. */
  samConcepts: Record<string, { framesWithHits: number; distinctIds: number[] }>;
  judgements: RecordedJudgement[];
  finishChecks: RecordedFinishCheck[];
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

/** Finds the repository's `fixtures/` directory by walking up from `start`. */
export function findFixturesDir(start: string = process.cwd()): string {
  let dir = resolve(start);
  for (;;) {
    const candidate = join(dir, "fixtures");
    if (existsSync(join(candidate, "README.md"))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`No fixtures/ directory above ${start}`);
    dir = parent;
  }
}

/** Loads and validates one recorded job, e.g. `ps1_buttons`. */
export async function loadJobFixture(
  job: string,
  fixturesDir: string = findFixturesDir(),
): Promise<JobFixture> {
  const dir = join(fixturesDir, job);
  const [stepsAndSam, runA, runB] = await Promise.all([
    readJson(join(dir, "spark_steps_and_sam_summary.json")).then((v) => StepsAndSamFile.parse(v)),
    readJson(join(dir, "stepcheck_run_a.json")).then((v) => RunAFile.parse(v)),
    readJson(join(dir, "stepcheck_run_b.json")).then((v) => RunBFile.parse(v)),
  ]);
  return {
    job,
    source: stepsAndSam.source,
    steps: toStepDrafts(stepsAndSam.steps),
    samConcepts: Object.fromEntries(
      Object.entries(stepsAndSam.sam).map(([concept, s]) => [
        concept,
        { framesWithHits: s.frames_with_hits, distinctIds: s.distinct_ids },
      ]),
    ),
    judgements: runA.rows.map((r) => ({
      step: r.step,
      case: r.case,
      expected: r.expected,
      verdict: r.verdict,
      confidence: r.confidence,
      evidence: r.evidence,
    })),
    finishChecks: runB,
  };
}
