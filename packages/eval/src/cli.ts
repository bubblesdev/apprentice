#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { CoachPolicy } from "@apprentice/coach";
import { Guide, RecordingLabels, withoutBlankValues } from "@apprentice/core";
import { CostMeter, MetaEnv, createMetaAdapters, tokenCost } from "@apprentice/meta";
import { FakeFrameExtractor, loadJobFixture } from "@apprentice/meta/fake";
import { FfmpegFrameExtractor } from "@apprentice/pipeline";
import type { z } from "zod";
import {
  attributionMarkdown,
  collect,
  readManifest,
  searchArchive,
  searchCommons,
  type SearchResult,
} from "./collect/index.js";
import { LabelledRun, runsFromFixture } from "./labelled.js";
import { compareReport, costReport, runReport } from "./report.js";
import { runEvalSet } from "./runner.js";
import { EvalSet, recordingCases, syntheticCases } from "./sets.js";

const USAGE = `apprentice-eval <command>

  report [run.json ...]       Score labelled runs (default: the recorded spike-2 runs). Free.
  compare <before> <after>    Gate metrics and changed cases between two runs. Free.
  set synth --guide g.json --video expert.mp4 --out set.json [--name n] [--attribution a]
                              Cases cut from the expert's own video. Free.
  set from-labels --guide g.json --expert e.mp4 --trainee t.mp4 --labels l.json --out set.json
                              Gold cases from a labelled trainee recording (made on /lab). Free.
  run --set set.json --out run.json [--cap 1] [--yes-spend]
                              Judges every case with Muse Spark, like the coach. Calls are cached
                              by request hash, so a re-run is free; live calls need --yes-spend
                              and stop at the cap (US dollars).
  collect --query "bike chain" --out videos/ [--source commons|archive|both] [--limit 10]
          [--max-mb 200] [--dry-run] [--only commons:123,archive:item]
                              Openly licensed videos (CC0, public domain, CC BY, CC BY-SA only)
                              from Wikimedia Commons and Internet Archive, with a manifest and
                              ATTRIBUTION.md. Free.`;

const readJson = async <T extends z.ZodTypeAny>(schema: T, path: string): Promise<z.infer<T>> =>
  schema.parse(JSON.parse(await readFile(path, "utf8")));

const writeJson = (path: string, value: unknown) =>
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`);

function need(values: Record<string, string | boolean | undefined>, ...names: string[]): string[] {
  return names.map((n) => {
    const v = values[n];
    if (typeof v !== "string" || !v) throw new Error(`Missing --${n}\n\n${USAGE}`);
    return v;
  });
}

async function report(files: string[]): Promise<string> {
  const policy = CoachPolicy.parse({});
  const fixture = await loadJobFixture("ps1_buttons");
  const runs = files.length
    ? await Promise.all(files.map((f) => readJson(LabelledRun, f)))
    : runsFromFixture(fixture);
  const { calls, inputTokens, outputTokens } = fixture.judgeUsage;
  const perJudgement = tokenCost("muse-spark-1.3", inputTokens, outputTokens) / calls;
  return [
    "# Apprentice eval",
    ...runs.map((r) => runReport(r, policy)),
    costReport(perJudgement, calls, policy),
  ].join("\n\n");
}

async function set(args: string[]): Promise<string> {
  const [kind, ...rest] = args;
  const { values } = parseArgs({
    args: rest,
    options: {
      guide: { type: "string" },
      video: { type: "string" },
      expert: { type: "string" },
      trainee: { type: "string" },
      labels: { type: "string" },
      out: { type: "string" },
      name: { type: "string" },
      attribution: { type: "string" },
    },
  });
  const createdAt = new Date().toISOString();
  const attribution = values.attribution ? { attribution: values.attribution } : {};
  let built: EvalSet;
  if (kind === "synth") {
    const [guidePath, video] = need(values, "guide", "video");
    const guide = await readJson(Guide, guidePath ?? "");
    const path = resolve(video ?? "");
    built = EvalSet.parse({
      name: values.name ?? `${guide.title} (synthetic)`,
      createdAt,
      guide,
      expertVideo: path,
      traineeVideo: path,
      ...attribution,
      cases: syntheticCases(guide),
    });
  } else if (kind === "from-labels") {
    const [guidePath, expert, trainee, labelsPath] = need(
      values,
      "guide",
      "expert",
      "trainee",
      "labels",
    );
    const guide = await readJson(Guide, guidePath ?? "");
    const labels = await readJson(RecordingLabels, labelsPath ?? "");
    if (labels.guideId !== guide.id || labels.guideVersion !== guide.version)
      throw new Error(
        `The labels are for guide ${labels.guideId} v${labels.guideVersion}, not ${guide.id} v${guide.version}`,
      );
    built = EvalSet.parse({
      name: values.name ?? `${guide.title}: ${labels.video.name}`,
      createdAt,
      guide,
      expertVideo: resolve(expert ?? ""),
      traineeVideo: resolve(trainee ?? ""),
      ...attribution,
      cases: recordingCases(labels),
    });
  } else {
    throw new Error(USAGE);
  }
  const [out] = need(values, "out");
  await writeJson(out ?? "", built);
  return `Wrote ${built.cases.length} cases to ${out}`;
}

async function run(args: string[]): Promise<string> {
  const { values } = parseArgs({
    args,
    options: {
      set: { type: "string" },
      out: { type: "string" },
      cap: { type: "string", default: "1" },
      "yes-spend": { type: "boolean", default: false },
    },
  });
  const [setPath, out] = need(values, "set", "out");
  const evalSet = await readJson(EvalSet, setPath ?? "");
  const capUsd = Number(values.cap);
  if (!Number.isFinite(capUsd) || capUsd <= 0) throw new Error("--cap must be a positive number");
  const env = MetaEnv.parse(withoutBlankValues(process.env));
  const meter = new CostMeter({ scope: { kind: "eval", id: evalSet.name }, capUsd });
  const adapters = await createMetaAdapters({ env, meter });
  if (adapters.mode === "live" && !values["yes-spend"]) {
    return (
      `This set has ${evalSet.cases.length} cases (about $${(evalSet.cases.length * 0.0093).toFixed(2)} ` +
      `uncached, capped at $${capUsd}). Re-run with --yes-spend, or APPRENTICE_ADAPTERS=replay for cached answers only.`
    );
  }
  const frames =
    adapters.mode === "fake"
      ? new FakeFrameExtractor(env.APPRENTICE_FIXTURE_JOB)
      : new FfmpegFrameExtractor();
  const outcome = await runEvalSet(evalSet, {
    reasoner: adapters.reasoner,
    frames,
    onCase: (done, total, c) =>
      process.stderr.write(`${done}/${total} ${c.id}: ${c.label} -> ${c.predicted.kind}\n`),
  });
  await writeJson(out ?? "", outcome.run);
  const cached = meter.events.filter((e) => e.cached).length;
  return [
    `Wrote ${outcome.run.cases.length} judged cases to ${out} (${adapters.mode} mode).`,
    `${outcome.errors} errors, ${cached} cached answers, $${meter.spentUsd.toFixed(4)} spent.`,
    outcome.stoppedEarly
      ? `Stopped at the $${capUsd} cap; re-run with a higher --cap to finish (judged cases are cached).`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function collectVideos(args: string[]): Promise<string> {
  const { values } = parseArgs({
    args,
    options: {
      query: { type: "string" },
      out: { type: "string" },
      source: { type: "string", default: "both" },
      limit: { type: "string", default: "10" },
      "max-mb": { type: "string", default: "200" },
      "dry-run": { type: "boolean", default: false },
      only: { type: "string" },
    },
  });
  const [query, out] = need(values, "query", "out");
  const only = values.only ? new Set(values.only.split(",").map((id) => id.trim())) : undefined;
  const limit = Number(values.limit);
  const maxBytes = Number(values["max-mb"]) * 1e6;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50)
    throw new Error("--limit must be 1 to 50");
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) throw new Error("--max-mb must be positive");
  const sources = values.source === "both" ? ["commons", "archive"] : [values.source];
  const results: SearchResult[] = await Promise.all(
    sources.map(async (s) => {
      const search = s === "commons" ? searchCommons : s === "archive" ? searchArchive : undefined;
      if (!search) throw new Error("--source must be commons, archive or both");
      try {
        return await search(query ?? "", { limit });
      } catch (error) {
        const why = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Could not search ${s === "commons" ? "Wikimedia Commons" : "Internet Archive"}: ${why}`,
        );
      }
    }),
  );
  const candidates = results
    .flatMap((r) => r.candidates)
    .filter((c) => !only || only.has(`${c.source}:${c.id}`));
  const lines = [
    `${candidates.length} reusable videos, ${results.reduce((n, r) => n + r.rejected.length, 0)} left out.`,
    ...results.flatMap((r) =>
      r.rejected.map((x) => `  left out ${x.source}:${x.id} "${x.title}": ${x.reason}`),
    ),
  ];
  if (values["dry-run"]) {
    lines.push(
      ...candidates.map(
        (c) =>
          `  ${c.source}:${c.id} "${c.title}" (${c.licence.id}, ${c.sizeBytes ? `${Math.round(c.sizeBytes / 1e6)} MB` : "size unknown"})`,
      ),
    );
    return lines.join("\n");
  }
  const dir = resolve(out ?? "");
  const added = await collect(candidates, {
    dir,
    maxBytes,
    onSkip: (c, why) => process.stderr.write(`skipped ${c.source}:${c.id}: ${why}\n`),
  });
  const manifest = await readManifest(dir);
  await writeFile(join(dir, "ATTRIBUTION.md"), attributionMarkdown(manifest));
  lines.push(
    `Downloaded ${added.length}; ${manifest.videos.length} in ${dir}/manifest.json and ATTRIBUTION.md.`,
  );
  return lines.join("\n");
}

async function compare(files: string[]): Promise<string> {
  const [before, after] = files;
  if (!before || !after) throw new Error(USAGE);
  const [a, b] = await Promise.all([readJson(LabelledRun, before), readJson(LabelledRun, after)]);
  return compareReport(a, b, CoachPolicy.parse({}));
}

async function main([command, ...rest]: string[]): Promise<string> {
  switch (command) {
    case undefined:
    case "report":
      return report(rest);
    case "compare":
      return compare(rest);
    case "set":
      return set(rest);
    case "run":
      return run(rest);
    case "collect":
      return collectVideos(rest);
    case "help":
    case "--help":
      return USAGE;
    default:
      // `apprentice-eval a.json b.json` keeps working as a report.
      if (command.endsWith(".json")) return report([command, ...rest]);
      throw new Error(USAGE);
  }
}

main(process.argv.slice(2)).then(
  (text) => process.stdout.write(`${text}\n`),
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  },
);
