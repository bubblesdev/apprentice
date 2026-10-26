# Apprentice

Film an expert doing a hands-on job once. Apprentice turns it into a verified step-by-step guide, then watches a beginner do the same job through a phone camera and catches mistakes before they matter.

Built for the Meta Global AI Developer Hackathon (26 Oct to 4 Nov 2026). Everything in this repository was written during the hackathon, starting 26 Oct 2026.

## The problem

Hands-on know-how lives in a few experts' heads: servicing equipment, assembly, repairs, lab bench work, kitchen prep, field installs. Training someone new means the expert stands beside them for days, and written instructions go stale or get skipped.

## How it works (Meta models)

1. **Capture.** Muse Spark watches the expert's video with its audio and splits the job into steps, parts, tools, checks and warnings. Muse Voice Transcribe captures the narration.
2. **Ground.** SAM 3.1 tracks every part and tool through the video, so each step carries the exact frames and highlighted objects that show what "correct" looks like.
3. **Explain.** Muse Image draws a clean diagram for each step from the real frames.
4. **Coach live.** The trainee points a phone at their work. Apprentice compares what it sees with the expert's step, says the next instruction, and stops them on a skipped or wrong step.
5. **Prove.** A run report marks every step passed or failed, with frames as evidence. Repeated mistakes improve the guide once the expert approves.

## Repository

| Path                | What it is                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `packages/core`     | Domain model and zod schemas (Guide, Step, Session, Verdict) and the ports the domain depends on                         |
| `packages/meta`     | Muse Spark and SAM 3.1 adapters, request-hash cache, retries, cost meter, fixture-backed fakes                           |
| `packages/coach`    | Live coach: verify-then-advance state machine, policy, step verifier, run report                                         |
| `packages/pipeline` | Instructions to guide: step draft, boundary refinement, reference frames, part grounding as idempotent, versioned stages |
| `packages/eval`     | Accuracy and cost harness: per-verdict precision and recall, coach gate metrics, cost per guide and coaching minute      |
| `packages/store`    | Postgres repositories and the pg-boss job queue                                                                          |
| `apps/api`          | Hono HTTP + WebSocket API for guides and live coaching sessions                                                          |
| `apps/worker`       | pg-boss worker that builds guides                                                                                        |
| `apps/web`          | React + Vite PWA: home, building, guide, live coach, report                                                              |
| `docs/`             | Architecture, decisions, plan and project context                                                                        |
| `spike/`            | Day-1 feasibility experiments (Python) and their results                                                                 |

Development: `pnpm install`, then `pnpm check` (lint, typecheck, tests). Set `TEST_DATABASE_URL` to also run the Postgres integration tests. Run the product with no key and no database: `pnpm build`, then `APPRENTICE_FAKE_JUDGE=pass pnpm --filter @apprentice/api start` and `pnpm --filter @apprentice/web dev`, and open http://localhost:5173 (fake Meta adapters, recorded PS1 guide).

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

## Running the spike

```bash
python3 -I spike/apprentice_spike.py <video> "part one" "part two"
```

Needs a Meta Model API key in the `META_MODEL_API_KEY` environment variable. Never commit keys.

## Test media

`samples/` is not committed. The day-1 test video is "How to Fix Sticking or Squeaking Buttons on the PlayStation 1" from Wikimedia Commons, licensed CC BY 3.0.
