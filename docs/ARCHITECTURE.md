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

| Package             | Responsibility                                                                                                          | Depends on        |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `packages/core`     | Domain model and zod schemas: Source, Guide, Step, PartRef, Evidence, Session, Verdict, Budget                          | zod               |
| `packages/meta`     | Meta Model API client (Responses, Files), SAM 3.1 output parser, cost meter, retries; implements the ports              | core              |
| `packages/pipeline` | Instructions to guide: ingest, step draft, boundary refinement, reference frames, part grounding, diagrams, safety tags | core, ports       |
| `packages/coach`    | Live session state machine, frame sampler policy, verifier, confidence policy, safety gates                             | core, ports       |
| `packages/ui`       | Design tokens, components, motion; web first, tokens reusable by native shells                                          | none              |
| `packages/eval`     | Labelled runs to precision/recall per verdict, cost per guide and per coaching minute                                   | core, coach       |
| `apps/api`          | Hono HTTP + WebSocket: auth, guides, sessions, signed uploads, live verdict stream                                      | core, coach, meta |
| `apps/worker`       | Background jobs for the pipeline                                                                                        | pipeline, meta    |
| `apps/web`          | React + Vite PWA: home, building, guide, coach, report                                                                  | core, ui          |

## Ports (interfaces the domain depends on)

- `VisionReasoner`: draft steps from a video or document; refine a step's end time from dense frames; judge a live step against the expert's reference frames.
- `Segmenter`: track or locate concepts in a video clip or image.
- `Transcriber`: speech to text, file and realtime.
- `Illustrator`: step diagram from reference frames.
- `FrameExtractor`: still frames from a source video at given times.
- `GuideRepository`, `SessionRepository`, `JobQueue`, `Clock`: infrastructure (in-memory versions in `core` for tests and single-process development).

## Meta adapters and credits

`packages/meta` implements the ports on Muse Spark (`SparkReasoner`) and SAM 3.1 (`SamSegmenter`). The live client is wrapped as `CachedMetaApi(RetryingMetaApi(MetaClient))`: every distinct request is hashed, paid for once and replayed after. A `CostMeter` per guide, session or eval run records each call (cache hits at zero cost) and enforces a hard cap. `APPRENTICE_ADAPTERS` selects `live`, `replay` (recordings only) or `fake` (fixtures/ from the spikes); see ADR 0006.

## Coach state machine

```
briefing ─► doing(step) ─► verifying ─┬─► passed ─► doing(step+1) ... ─► complete
                                      ├─► closer   (low confidence: ask to show the part)
                                      ├─► retry    (wrong or incomplete, with evidence)
                                      └─► blocked  (unsafe: stop, explain, require acknowledgement)
```

Advance only when the verifier says done with confidence >= threshold on two consecutive samples, and required parts are present (Segmenter). All thresholds live in one policy object and are tuned by `packages/eval`.

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
