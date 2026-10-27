# Apprentice

Film an expert doing a hands-on job once. Apprentice turns it into a verified step-by-step guide, then watches a beginner do the same job through a phone camera and catches mistakes before they matter.

Built for the Meta Global AI Developer Hackathon (26 Oct to 4 Nov 2026). Everything in this repository was written during the hackathon, starting 26 Oct 2026.

## The problem

Hands-on know-how lives in a few experts' heads: servicing equipment, assembly, repairs, lab bench work, kitchen prep, field installs. Training someone new means the expert stands beside them for days, and written instructions go stale or get skipped.

## How it works (Meta models)

1. **Read any instructions.** Upload a video, paste a direct video link, or add a PDF, help page or Markdown doc. **Muse Spark** watches the video with its audio (or reads the text) and splits the job into ordered steps with parts, tools, a "done when" check and warnings, then looks at dense frames around each step's end to find exactly when it is finished.
2. **Ground it.** **SAM 3.1** finds each part in the expert's finished frames, so every step carries the frame and the highlighted part that show what correct looks like.
3. **Explain and make it safe.** **Muse Image** draws a clean, labelled diagram per step. **Muse Wonder** reviews the whole guide for hazards; steps marked stop must be acknowledged before the coach starts them.
4. **Coach live.** The trainee points a phone at their work and says "I'm done". Muse Spark compares their frames with the expert's, SAM 3.1 checks the parts are in view, and a deterministic policy advances only on two agreeing confident checks. Otherwise it asks to see closer, sends them back with evidence, or stops them. They can ask a question by voice (**Muse Voice Transcribe**) and get a short answer from Muse Spark.
5. **Prove and improve.** A run report shows every step with its evidence frames and **Muse Wonder**'s review. Steps that many trainees struggle with are flagged for the guide's author, who can edit and re-approve the guide.

Every Meta call is hashed and cached (paid once), metered and capped per guide and per session. Without a key, fakes replay the recorded day-1 outputs or return clearly labelled placeholders.

## Repository

| Path                | What it is                                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `packages/core`     | Domain model, zod schemas, the API wire contract and the ports the domain depends on                                       |
| `packages/meta`     | Muse Spark, SAM 3.1, Muse Image, Voice Transcribe and Muse Wonder adapters; request-hash cache, retries, cost meter, fakes |
| `packages/coach`    | Live coach: verify-then-advance state machine, policy, step verifier, run report, guide insights                           |
| `packages/pipeline` | Instructions to guide: ingest, step draft, boundary refinement, reference frames, grounding, diagrams, safety review       |
| `packages/eval`     | Accuracy and cost harness: per-verdict precision and recall, coach gate metrics, cost per guide and coaching minute        |
| `packages/store`    | Postgres repositories, pg-boss queue, file and R2 media stores                                                             |
| `packages/ui`       | Design tokens shared by web and future native shells                                                                       |
| `apps/api`          | Hono HTTP + WebSocket API for guides and live coaching sessions                                                            |
| `apps/worker`       | pg-boss worker that builds guides                                                                                          |
| `apps/web`          | React + Vite PWA: home, building, guide (with editor), live coach, report                                                  |
| `e2e/`              | Playwright specs that drive the built app against the API on fake adapters                                                 |
| `docs/`             | Architecture, decisions, deploy, eval baseline, plan and project context                                                   |
| `spike/`            | Day-1 feasibility experiments (Python) and their results                                                                   |

Development: `pnpm install`, then `pnpm check` (lint, typecheck, tests). Set `TEST_DATABASE_URL` to also run the Postgres integration tests; `pnpm e2e` drives the built app in Chromium. Run the product with no key and no database: `pnpm build`, then `APPRENTICE_FAKE_JUDGE=pass pnpm --filter @apprentice/api start` and `pnpm --filter @apprentice/web dev`, and open http://localhost:5173 (fake Meta adapters, recorded PS1 guide).

## Built during the hackathon (log)

- **26 Oct 2026:** idea; spike 1 (SAM 3.1 tracking + Muse Spark step split on a real repair video); spike 2 (per-step check); clickable UI prototype; architecture and decisions; monorepo scaffold with `core` and `meta` packages, tests and CI.
- **26 Oct 2026:** `meta` adapters: Muse Spark reasoner (step draft, boundary refinement, strict-instructor step judge), SAM 3.1 segmenter, request-hash response cache (each real call paid once), retries, per-scope cost meter with a hard cap, and fakes that replay the recorded spike outputs.
- **26 Oct 2026:** `coach` package: pure verify-then-advance state machine and policy (two-sample agreement, required parts, show me closer, retry, unsafe stop, safety briefings, trainee override marked unverified), step verifier on the Meta ports, run report; exhaustive state and event tests.
- **26 Oct 2026:** `pipeline` package: step draft, boundary refinement on dense frames around each drafted end, reference frames and SAM part grounding as idempotent stages keyed by a hash of their input; tested on the recorded PS1 job (a rebuild makes no model calls).
- **26 Oct 2026:** `eval` package and CLI: per-verdict precision and recall, coach gate metrics (pass rate, catch rate, false passes, false unsafe stops), threshold sweep and cost per guide and coaching minute; baseline from the recorded spike-2 runs in `docs/eval/baseline-spike2.md`.
- **26 Oct 2026:** `apps/api` (Hono HTTP + WebSocket live coaching loop, shared zod wire contract, per-session budget caps) and `apps/worker` (pg-boss guide builds); `store` package with Postgres repositories and queue, tested against a real Postgres and pg-boss; ffmpeg frame extractor.
- **26 Oct 2026:** ingest (video upload stored by content hash, direct video link download, pasted documents), build progress for the Building screen, reference and evidence frame endpoints, and a guard that only lets builds read local files from the uploads directory.
- **26 Oct 2026:** `apps/web` PWA following the approved prototype: Home (video upload, direct link, written instructions, drag and drop), Building (live pipeline progress), Guide (expert frames, highlights, safety notes), Live coach (rear camera, glass step sheet, verify-then-advance with show me closer, retry and stop, voice prompts, haptics) and Report (score, featured catch, evidence strip); `ui` design tokens; walked end to end in a headless phone browser.
- **26 Oct 2026:** guide editor: rename, reword, reorder and delete steps (each keeps its expert frames and parts), optimistic version check, approve; `PATCH /guides/:id`.
- **26 Oct 2026:** PDF and help-page import: text extracted on the server (unpdf for PDFs, Readability for help pages) before drafting; an SSRF guard refuses links that resolve to private or local addresses, checked on every redirect; the worker now ingests links too.
- **26 Oct 2026:** Muse Image step diagrams: `MuseIllustrator` (prompted with the step, its parts and the expert's finished frame), a fifth pipeline stage that stores one diagram per step (a failed diagram never fails the guide), a Photo/Diagram toggle on the Guide screen, and a clearly labelled placeholder in fake mode.
- **26 Oct 2026:** voice questions: the coach's mic opens Ask about this step (tap to talk or type); the browser records and encodes 16 kHz mono WAV, Muse Voice Transcribe turns it into text, Muse Spark answers in two short sentences while looking at the trainee's latest frame; transcripts cached and metered per second.
- **26 Oct 2026:** Muse Wonder: a safety review stage reads the whole guide and sets each step's level and note (the more severe of draft and review wins; a stop step needs acknowledging in the coach), and an audit of every finished run (summary, steps worth a second look, wording suggestions for the author) shown on the report. A labelled rule-based fallback stands in without credits.
- **26 Oct 2026:** durable media (file store on a shared volume, Cloudflare R2 via signed S3 requests; keys checked so nothing escapes its folder) and guide insights: across runs of the current version, steps where trainees needed another try are flagged on the Guide screen for the author.
- **26 Oct 2026:** Playwright end-to-end specs (add instructions, build, edit and approve, a full coached run, a question, an early end), one-machine deploy (Dockerfile, fly.toml, Cloudflare Pages fallback, `docs/DEPLOY.md`), and an opt-in probe that confirms the unverified Meta formats for about $0.02 (ADR 0007).
- **27 Oct 2026:** sharing: a short coaching link (`/c/:guideId`) with its own landing page, a share sheet with a printable QR code, an install prompt (Chrome's prompt, or Safari's Add to Home Screen steps on iPhone) and PNG home-screen icons.
- **27 Oct 2026:** eval tooling, all free until James runs it with a key: eval sets from a guide's own video or from a labelled trainee recording, a runner that judges each case through the coach's own check (cached, capped, refuses live calls without `--yes-spend`), a before-and-after comparison, an open-video collector for Wikimedia Commons and Internet Archive that keeps only CC0, public domain, CC BY and CC BY-SA videos with their credits, and an eval lab page (`/lab`) for marking where each step ended in a recording.
- **27 Oct 2026 (local, live Meta models):** probe confirmed Muse Spark, Muse Wonder and Muse Image formats and found the real Voice Transcribe endpoint (`POST /asr/transcribe`, `transcript`), now used by the client; blank `.env` values no longer stop the API; the collector reads real Internet Archive lengths and public domain dedications and downloads only picked items (`--only`); first live smoke test (PS1 guide built for $0.58, a coached run, a spoken question, report and audit); first live synthetic eval on five openly licensed repair videos and a judge prompt change, results in `docs/eval/results-2026-10-27.md`.

## Running the spike

```bash
python3 -I spike/apprentice_spike.py <video> "part one" "part two"
```

Needs a Meta Model API key in the `META_MODEL_API_KEY` environment variable. Never commit keys.

## Test media

`samples/` is not committed. The day-1 test video is "How to Fix Sticking or Squeaking Buttons on the PlayStation 1" from Wikimedia Commons, licensed CC BY 3.0.
