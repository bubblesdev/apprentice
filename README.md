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

| Path             | What it is                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| `packages/core`  | Domain model and zod schemas (Guide, Step, Session, Verdict) and the ports the domain depends on |
| `packages/meta`  | Muse Spark and SAM 3.1 adapters, request-hash cache, retries, cost meter, fixture-backed fakes   |
| `packages/coach` | Live coach: verify-then-advance state machine, policy, step verifier, run report                 |
| `apps/`          | Web app, API and worker (next)                                                                   |
| `docs/`          | Architecture, decisions, plan and project context                                                |
| `spike/`         | Day-1 feasibility experiments (Python) and their results                                         |

Development: `pnpm install`, then `pnpm check` (lint, typecheck, tests).

## Built during the hackathon (log)

- **26 Oct 2026:** idea; spike 1 (SAM 3.1 tracking + Muse Spark step split on a real repair video); spike 2 (per-step check); clickable UI prototype; architecture and decisions; monorepo scaffold with `core` and `meta` packages, tests and CI.
- **26 Oct 2026:** `meta` adapters: Muse Spark reasoner (step draft, boundary refinement, strict-instructor step judge), SAM 3.1 segmenter, request-hash response cache (each real call paid once), retries, per-scope cost meter with a hard cap, and fakes that replay the recorded spike outputs.
- **26 Oct 2026:** `coach` package: pure verify-then-advance state machine and policy (two-sample agreement, required parts, show me closer, retry, unsafe stop, safety briefings, trainee override marked unverified), step verifier on the Meta ports, run report; exhaustive state and event tests.

## Running the spike

```bash
python3 -I spike/apprentice_spike.py <video> "part one" "part two"
```

Needs a Meta Model API key in the `META_MODEL_API_KEY` environment variable. Never commit keys.

## Test media

`samples/` is not committed. The day-1 test video is "How to Fix Sticking or Squeaking Buttons on the PlayStation 1" from Wikimedia Commons, licensed CC BY 3.0.
