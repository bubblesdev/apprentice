# Architecture

Apprentice turns instructions (a video, a manual, a help doc) into a verified step-by-step guide, then coaches a person live through their phone camera and checks every step before moving on.

## Principles

1. **Domain first, vendors behind ports.** The product logic (`core`, `pipeline`, `coach`) never imports a vendor SDK. Meta's models sit behind small interfaces in `packages/meta`, so an open-weight model or a test double is one adapter.
2. **The model proposes, policy decides.** A model returns a verdict with confidence and evidence; deterministic code decides whether to advance, retry, ask for a closer look or stop.
3. **Evidence everywhere.** Every verdict stores the frames, boxes or masks and the sentence that justify it, and the UI shows them.
4. **Idempotent, versioned pipeline.** Each stage writes a versioned artifact. Re-running a stage never repeats earlier paid work.
5. **Metered and capped.** Every model call records tokens, frames and estimated cost against a guide or a session budget.
6. **Validate at every boundary.** zod schemas for API input, model output and stored artifacts.

## System

```
  phone browser (PWA)                    server                                 Meta Model API
 ┌──────────────────┐   HTTPS / WS   ┌───────────────┐     jobs     ┌───────────┐    ┌──────────────────┐
 │ apps/web         │ ─────────────► │ apps/api      │ ───────────► │ apps/worker│───►│ Muse Spark/Wonder │
 │ camera, coach UI │ ◄───────────── │ guides,       │   pg-boss    │ pipeline  │    │ SAM 3.1           │
 └──────────────────┘   verdicts     │ sessions, WS  │              └───────────┘    │ Voice Transcribe  │
                                     └──────┬────────┘                    │          │ Muse Image        │
                                            │                             │          └──────────────────┘
                                      Postgres (Neon)               Cloudflare R2 (media)
```

## Packages

| Package             | Responsibility                                                                                                          | Depends on                         |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `packages/core`     | Domain model and zod schemas: Source, Guide, Step, PartRef, Evidence, Session, Verdict, Budget                          | zod                                |
| `packages/meta`     | Meta Model API client (Responses, Files), SAM 3.1 output parser, cost meter, retries; implements the ports              | core                               |
| `packages/pipeline` | Instructions to guide: ingest, step draft, boundary refinement, reference frames, part grounding, diagrams, safety tags | core, ports                        |
| `packages/coach`    | Live session state machine, frame sampler policy, verifier, confidence policy, safety gates                             | core, ports                        |
| `packages/store`    | Postgres repositories (guides, sessions, artifacts, usage events) and the pg-boss queue                                 | core                               |
| `packages/ui`       | Design tokens, components, motion; web first, tokens reusable by native shells                                          | none                               |
| `packages/eval`     | Labelled runs to precision/recall per verdict, cost per guide and per coaching minute                                   | core, coach                        |
| `apps/api`          | Hono HTTP + WebSocket: guides, sessions, live verdict stream; in memory or on Postgres                                  | core, coach, meta, pipeline, store |
| `apps/worker`       | Background jobs for the pipeline (pg-boss)                                                                              | pipeline, meta, store              |
| `apps/web`          | React + Vite PWA: home, building, guide, coach, report                                                                  | core, ui                           |

## Ports (interfaces the domain depends on)

- `VisionReasoner` (Muse Spark): draft steps from a video or document; refine a step's end time from dense frames; judge a live step against the expert's reference frames; answer a trainee's question about the current step.
- `Segmenter` (SAM 3.1): track or locate concepts in a video clip or image.
- `Transcriber` (Muse Voice Transcribe): speech to text for spoken questions.
- `Illustrator` (Muse Image): a labelled step diagram from the expert's finished frame.
- `Auditor` (Muse Wonder): safety review of a drafted guide; audit of a finished run.
- `FrameExtractor` (ffmpeg): still frames from a source video at given times.
- `GuideRepository`, `SessionRepository`, `BuildStatusRepository`, `MediaStore`, `JobQueue`, `Clock`: infrastructure, with in-memory versions in `core` and Postgres, file and R2 versions in `store`.

## Meta models and their jobs

| Model                 | Where                | Job                                                                                                       |
| --------------------- | -------------------- | --------------------------------------------------------------------------------------------------------- |
| Muse Spark            | pipeline, coach, API | Watch the video (frames and audio) or read the manual; find step ends; judge live steps; answer questions |
| SAM 3.1               | pipeline, coach      | Ground each part in the expert's frames; check the parts are in the trainee's view                        |
| Muse Image            | pipeline             | One clean, labelled diagram per step                                                                      |
| Muse Voice Transcribe | API                  | The trainee's spoken questions, hands-free                                                                |
| Muse Wonder           | pipeline, API        | Safety level per step (stop steps need acknowledging); review of every finished run                       |

## Meta adapters and credits

`packages/meta` implements the ports on Muse Spark (`SparkReasoner`) and SAM 3.1 (`SamSegmenter`). The live client is wrapped as `CachedMetaApi(RetryingMetaApi(MetaClient))`: every distinct request is hashed, paid for once and replayed after. A `CostMeter` per guide, session or eval run records each call (cache hits at zero cost) and enforces a hard cap. `APPRENTICE_ADAPTERS` selects `live`, `replay` (recordings only) or `fake` (fixtures/ from the spikes); see ADR 0006.

## Pipeline

`buildGuide` runs `draft_steps -> refine_boundaries -> reference_frames -> ground_parts -> draw_diagrams -> review_safety`; a prepare step first downloads direct video links and extracts text from PDFs and help pages. Each stage's output is stored under `name@vN:<hash of input>`, so a rebuild reuses everything whose input did not change and never repeats paid work. Boundary refinement fixes the weak link found in spike 2: Muse Spark picks the first finished frame from dense frames around each drafted end, and a confident answer moves the end and the next step's start. Grounding uses SAM 3.1 on single reference frames per step rather than whole-video tracking, because identities fragment over long clips (spike 1).

## Coach state machine

```
briefing ─► doing(step) ─► verifying ─┬─► passed ─► doing(step+1) ... ─► complete
                                      ├─► closer   (low confidence: ask to show the part)
                                      ├─► retry    (wrong or incomplete, with evidence)
                                      └─► blocked  (unsafe: stop, explain, require acknowledgement)
```

Advance only when the verifier says done with confidence >= threshold on two consecutive samples, and required parts are present (Segmenter). All thresholds live in one policy object (`CoachPolicy`) and are tuned by `packages/eval`. `decide` and `transition` in `packages/coach` are pure; `StepVerifier` is the only part that calls models. Stop-level safety steps open with a briefing; a trainee override after repeated closer requests is recorded as `decidedBy: "trainee"` and reported as unverified.

## API contract

`packages/core/src/api.ts` holds the zod schemas for every HTTP body and WebSocket message (`CreateGuideRequest`, `ClientMessage`, `ServerMessage`, `CoachUpdate`). The API and the web app both parse with them. The live loop: the client sends `check`, then a few frames per sample; the server stores them as evidence, runs the verifier and replies with a `CoachUpdate` (session, decision, whether an override is allowed, sampling rate).

## Data

Postgres tables: `sources`, `guides`, `steps`, `step_references`, `part_tracks`, `sessions`, `verdicts`, `usage_events`. Media (videos, frames, masks, diagrams) in R2 under `guides/<id>/...` and `sessions/<id>/...`, served by signed URLs.

## Quality bar

Strict TypeScript, ESLint + Prettier, Vitest unit tests per package, Playwright for the coach flow, GitHub Actions CI on every push, conventional commits, decisions in `docs/decisions/`.

## Decisions

- ADR 0001: TypeScript monorepo with pnpm workspaces and Turborepo.
- ADR 0002: Meta models behind ports in `packages/meta`.
- ADR 0003: Model proposes, deterministic policy decides.
- ADR 0004: PWA first; native iOS (glassy, Liquid Glass style) and Android shells reuse core, coach and design tokens later.
- ADR 0005: Postgres + pg-boss for jobs; R2 for media; Fly.io for api and worker.
- ADR 0006: Request-hash cache and adapter modes (live, replay, fake).
- ADR 0007: Unconfirmed Meta formats are isolated and probed; outbound fetches are guarded.
