#!/usr/bin/env node
/**
 * One-off check of the Meta Model API formats this repo could not confirm without a key:
 * Muse Image output, Voice Transcribe endpoint, Muse Wonder and Muse Spark replies. Each model is
 * called once with a tiny input (about $0.02 in total), the raw responses are saved, and the
 * script reports whether the adapters' parsers understand them.
 *
 *   META_MODEL_API_KEY=... pnpm --filter @apprentice/meta probe -- --yes-spend
 *   ... probe -- --yes-spend --only=voice-transcribe   (re-check one model)
 *
 * Nothing runs without --yes-spend. The key is only sent as a header and never written.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_BASE_URL, extractImages } from "./client.js";
import { MUSE_IMAGE } from "./illustrator.js";
import { MUSE_SPARK } from "./spark.js";
import { VOICE_TRANSCRIBE } from "./transcriber.js";
import { MUSE_WONDER } from "./wonder.js";

/** One second of a 440 Hz tone, mono 16-bit PCM at 16 kHz. */
function toneWav(): Uint8Array {
  const rate = 16000;
  const samples = rate;
  const buf = new ArrayBuffer(44 + samples * 2);
  const v = new DataView(buf);
  const text = (at: number, s: string) =>
    [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF");
  v.setUint32(4, 36 + samples * 2, true);
  text(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, "data");
  v.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++)
    v.setInt16(44 + i * 2, Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000), true);
  return new Uint8Array(buf);
}

/** Reads a response body once: parsed JSON when it is JSON, else the raw text. */
async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

interface ProbeResult {
  name: string;
  ok: boolean;
  status?: number;
  note: string;
}

async function main(): Promise<void> {
  if (!process.argv.includes("--yes-spend")) {
    console.log(
      "This calls four Meta models once each (about $0.02). Re-run with --yes-spend to proceed.",
    );
    return;
  }
  const key = process.env.META_MODEL_API_KEY?.trim();
  if (!key) throw new Error("Set META_MODEL_API_KEY");
  const base = process.env.META_MODEL_API_URL ?? DEFAULT_BASE_URL;
  const outDir = join(process.env.META_CACHE_DIR ?? ".cache/meta", "probe");
  await mkdir(outDir, { recursive: true });
  const auth = { Authorization: `Bearer ${key}` };

  const save = async (name: string, status: number, body: unknown) =>
    writeFile(join(outDir, `${name}.json`), `${JSON.stringify({ status, body }, null, 1)}\n`);

  const respond = async (
    name: string,
    model: string,
    prompt: string,
  ): Promise<{ status: number; body: unknown }> => {
    const res = await fetch(`${base}/responses`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
      }),
    });
    const body = await readBody(res);
    await save(name, res.status, body);
    return { status: res.status, body };
  };

  const outputOf = (body: unknown): Record<string, unknown>[] =>
    body && typeof body === "object" && Array.isArray((body as { output?: unknown }).output)
      ? (body as { output: Record<string, unknown>[] }).output
      : [];

  const results: ProbeResult[] = [];
  const only = process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length);
  const run = async (name: string, fn: () => Promise<ProbeResult>) => {
    if (only && !only.split(",").includes(name)) return;
    try {
      results.push(await fn());
    } catch (error) {
      results.push({
        name,
        ok: false,
        note: error instanceof Error ? error.message : String(error),
      });
    }
  };

  await run("muse-spark", async () => {
    const r = await respond("muse-spark", MUSE_SPARK, "Reply with the single word OK.");
    return {
      name: "muse-spark",
      ok: r.status === 200,
      status: r.status,
      note: "Responses API text output",
    };
  });
  await run("muse-wonder", async () => {
    const r = await respond("muse-wonder", MUSE_WONDER, 'Reply with JSON only: {"ok":true}');
    return {
      name: "muse-wonder",
      ok: r.status === 200,
      status: r.status,
      note: "Same Responses API as Spark",
    };
  });
  await run("muse-image", async () => {
    const r = await respond(
      "muse-image",
      MUSE_IMAGE,
      "A simple white line drawing of a screwdriver on a black background.",
    );
    const images = extractImages(outputOf(r.body));
    return {
      name: "muse-image",
      ok: r.status === 200 && images.length > 0,
      status: r.status,
      note: images.length
        ? `Parser found ${images.length} image(s) (${images[0]?.base64 ? "base64" : "url"})`
        : "Parser found no image: compare the saved response with extractImages in client.ts",
    };
  });
  await run("voice-transcribe", async () => {
    const form = new FormData();
    const settings = { model: VOICE_TRANSCRIBE, audioEncoding: "WAV", mode: "PUSH_TO_TALK" };
    form.append("request", new Blob([JSON.stringify(settings)], { type: "application/json" }));
    form.append("audio", new Blob([toneWav()], { type: "audio/wav" }), "tone.wav");
    const res = await fetch(`${base}/asr/transcribe`, {
      method: "POST",
      headers: { ...auth, Accept: "application/json" },
      body: form,
    });
    const body = await readBody(res);
    await save("voice-transcribe", res.status, body);
    const hasText =
      !!body &&
      typeof body === "object" &&
      typeof (body as { transcript?: unknown }).transcript === "string";
    return {
      name: "voice-transcribe",
      ok: res.status === 200 && hasText,
      status: res.status,
      note: hasText
        ? "POST /asr/transcribe returns { transcript } (MetaClient.transcribe)"
        : "Endpoint or shape differs: see the saved response and MetaClient.transcribe",
    };
  });

  for (const r of results)
    console.log(`${r.ok ? "OK  " : "FAIL"} ${r.name.padEnd(17)} ${r.status ?? "-"}  ${r.note}`);
  console.log(`Raw responses saved in ${outDir}`);
  if (results.some((r) => !r.ok)) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
