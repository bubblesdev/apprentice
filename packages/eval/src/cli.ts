#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { CoachPolicy } from "@apprentice/coach";
import { tokenCost } from "@apprentice/meta";
import { loadJobFixture } from "@apprentice/meta/fake";
import { LabelledRun, runsFromFixture } from "./labelled.js";
import { costReport, runReport } from "./report.js";

/**
 * Usage: apprentice-eval [labelled-run.json ...]
 * With no files, scores the recorded spike-2 runs in fixtures/. Makes no model calls.
 */
async function main(files: string[]): Promise<void> {
  const policy = CoachPolicy.parse({});
  const fixture = await loadJobFixture("ps1_buttons");
  const runs =
    files.length > 0
      ? await Promise.all(
          files.map(async (f) => LabelledRun.parse(JSON.parse(await readFile(f, "utf8")))),
        )
      : runsFromFixture(fixture);
  const { calls, inputTokens, outputTokens } = fixture.judgeUsage;
  const perJudgement = tokenCost("muse-spark-1.3", inputTokens, outputTokens) / calls;
  const sections = [
    "# Apprentice eval",
    ...runs.map((r) => runReport(r, policy)),
    costReport(perJudgement, calls, policy),
  ];
  process.stdout.write(`${sections.join("\n\n")}\n`);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
