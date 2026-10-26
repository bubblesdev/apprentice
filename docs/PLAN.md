# Apprentice: plan for agreement (DRAFT, 26 Oct). Nothing is built until James agrees.

## 1. Hackathon rules we design around

| Rule (official guide, FAQ, #rules, #questions)                                                                                                                                                                                         | What we do                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New work only, 26 Oct to 4 Nov; demo shows only what was built                                                                                                                                                                         | Fresh repo started 26 Oct; README "Built during the hackathon" section with a dated log; the spike code is kept and dated                                         |
| Repository must be public                                                                                                                                                                                                              | MIT licence; no secrets, ever (env vars + `.env.example`); history checked with a secret scanner before going public                                              |
| Must use Meta models (Model API and/or open weights)                                                                                                                                                                                   | Muse Spark, SAM 3.1, Voice Transcribe, Muse Image, Muse Wonder are each core; optional Glimmer path                                                               |
| Submission: CV platform, public repo, 3-minute demo video, live product, all members listed                                                                                                                                            | Deployed web app with a public demo guide; demo recorded Mon 2 Nov                                                                                                |
| Anti-projects: medical advice, basic RAG, simple image analysers, dashboards as the main feature, Streamlit apps, edu chatbots, job screeners, personality analysers, nutrition and sports coaches; no code/data/assets without rights | Positioned as hands-on task verification for products and procedures; no medical, no "life coach"; the AI acts on evidence, not chat                              |
| Judging (official 26 Oct): Impact 30%, Meta tooling 25%, Technical depth 20%, Demo 25%; live final 9 Nov for top 5                                                                                                                     | Impact first: real users and accuracy numbers; model-by-model roles; eval harness; a demo video worth watching with a live on-camera catch                        |
| Track                                                                                                                                                                                                                                  | Indie unless real companies use it with numbers by 2 Nov                                                                                                          |
| Bonus prizes                                                                                                                                                                                                                           | Best Agentic (verify-then-advance agent), Best Creative (Muse Image step diagrams), Open-Weight (Glimmer checks, optional), Most Viral on X (post the catch clip) |
| Credits                                                                                                                                                                                                                                | $150 on James's team; budget below                                                                                                                                |

## 2. Product scope for 4 Nov

In: create a guide from (a) an uploaded video, (b) a direct video URL, (c) a PDF/Markdown/help page; guide editor (rename, reorder, delete steps, approve); live coach on phone web (camera, step card, voice prompts, verify-then-advance, skip/wrong/unsafe catches, "show me closer"); run report with evidence; share link to a guide.
Out (after the hackathon): native iOS/Android apps, team accounts and billing, YouTube links, AR overlays, offline mode, multi-language voice.

## 3. Architecture

Monorepo, TypeScript end to end, pnpm workspaces + Turborepo.

```
apprentice/
  apps/
    web/        React + Vite PWA (camera, live coach, editor); later wrapped or reused by iOS/Android
    api/        Node (Hono) HTTP + WebSocket: auth, guides, sessions, uploads, live verdicts
    worker/     Background jobs: guide building pipeline, SAM runs, diagram generation
  packages/
    core/       Domain model and zod schemas: Guide, Step, Checkpoint, Evidence, Session, Verdict
    meta/       Meta Model API client: Responses, Files, streaming, SAM output parser + mask decoder, cost meter, retries
    pipeline/   Instructions -> guide: ingest (video, URL, PDF, Markdown) -> step draft -> boundary refinement -> reference frames -> SAM grounding -> diagrams -> safety tags
    coach/      Live session engine: state machine, frame sampler, verifier (Spark judge + SAM presence), confidence policy, safety gates
    ui/         Design system: tokens, components, motion (shared by web and future native shells)
    eval/       Accuracy harness: labelled runs -> precision/recall per verdict, cost per guide and per minute of coaching
  docs/         PROJECT_CONTEXT, PLAN, ARCHITECTURE, DECISIONS (ADRs), DEMO script
```

Key design decisions

- **Ports and adapters.** `packages/meta` implements a `VisionModel`, `Segmenter`, `Transcriber`, `ImageGen` interface; the domain never imports vendor code. Swapping to open weights (Glimmer on Modal) is one adapter.
- **Pipeline as idempotent jobs.** Each stage writes a versioned artifact (steps v1, boundaries v2, references, grounding); re-running a stage never redoes earlier paid work. Postgres-backed queue (pg-boss), no extra Redis.
- **Coach = explicit state machine.** States: `briefing -> doing(step) -> verifying -> passed | retry | blocked(unsafe) -> next`. The model proposes a verdict with confidence and evidence; deterministic policy decides (e.g. advance only if confidence >= threshold on 2 consecutive samples; otherwise ask "show me closer").
- **Cheap by design.** Live checks send 2 to 3 small frames every few seconds only while verifying; SAM runs per step clip at 10 fps, never on whole long videos; every API call is metered and capped per guide/session.
- **Evidence everywhere.** Every verdict stores frame ids, masks/boxes and the model's sentence, shown in the UI and report.
- **Storage.** Postgres (Neon) for data; Cloudflare R2 for media (no egress fees); signed URLs.
- **Deploy.** web on Vercel or Cloudflare Pages; api + worker on Fly.io. Secrets only in the platform's env.
- **Quality bar.** Strict TypeScript, zod at every boundary, ESLint + Prettier, Vitest unit tests, Playwright for the coach flow, GitHub Actions CI, conventional commits, ADRs for big choices.
- **Mobile later.** The web app is a PWA with camera access; the same `core`, `coach` and `ui` tokens feed an Expo/React Native or native SwiftUI/Compose shell later.

## 4. UI and UX direction

Feel: premium, calm, native. **iOS must be glassy (James, 26 Oct): Liquid Glass style materials (translucent, blurred, layered surfaces) on iOS; prototype approved 26 Oct.** Dark-first with a light theme; one accent colour; generous space; SF/Inter type; subtle depth (frosted glass only on the camera overlay); motion that explains state, never decorates.
Core screens

1. **Home**: one drop zone, "Add instructions": video, link, or document. Recent guides below.
2. **Building**: live progress as the agent works ("Watching the video... 10 steps found... Locating parts..."), with frames appearing as steps are found.
3. **Guide**: vertical timeline of step cards (diagram, highlighted reference frame, parts, warning); edit and approve.
4. **Coach** (full-screen camera): top: step x of n and a thin progress line; bottom sheet: the instruction in large type with the reference frame thumbnail; a ring that fills while verifying; green check with haptic on pass; amber "show me closer"; red stop for unsafe or skipped, with the evidence frame side by side.
5. **Report**: score, per-step evidence strip, time taken, shareable link.
   Accessibility: voice prompts, large text, colour-independent states, reduced-motion support.
   Before building UI: a clickable design of the 5 screens (Figma or HTML prototype) for James to approve.

## 5. Reliability plan (the make-or-break)

- Step boundaries: second pass on dense frames around each boundary; validate with SAM events (part appears, disappears, moves).
- Verification: judge prompt compares trainee frames to the expert's end-state frames for that step; SAM confirms required parts present; two-sample agreement before advancing.
- Eval set: 3 jobs x (1 correct run + 1 run with a skipped step + 1 with a wrong part) filmed by James; target before demo: >= 90% correct "not finished" catches, >= 85% correct passes, 0 false "unsafe" stops in the demo job.
- Go / no-go: Wed 28 Oct evening. If targets are far off, narrow to guide capture + manual "I'm done" checkpoints with photo verification at key steps only.

## 6. Budget ($150 credits)

Guide building target <= $1 per 5-minute source; live coaching <= $0.05 per minute; development and evals capped at $60; demo and judging buffer $40; spend limit on the account.

## 7. Schedule (WAT; James works days, so evenings + weekend)

| Day        | Work                                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| Mon 26 Oct | Done: idea, spikes 1-2, context, this plan                                                                 |
| Tue 27     | Agree plan + UI direction; repo scaffold, CI, core types; Agents 101 session 5 PM WAT                      |
| Wed 28     | Pipeline: boundaries + references; film eval recordings; Agents 102 (verifiable agents) 5 PM WAT; go/no-go |
| Thu 29     | Coach engine + verifier + eval numbers                                                                     |
| Fri 30     | UI: home, building, guide screens                                                                          |
| Sat 31     | UI: coach + report; end-to-end on phone                                                                    |
| Sun 1 Nov  | Hardening, deploy, real users test, docs                                                                   |
| Mon 2      | Record the 3-minute demo; X post draft                                                                     |
| Tue 3      | Buffer, fixes, last questions to organisers                                                                |
| Wed 4      | Submit (deadline Thu 5 Nov 3 AM WAT); post on X with James's OK                                            |

## 8. Decisions needed from James

1. Agree scope (section 2) and stack (section 3).
2. Name: keep "Apprentice" or choose another before the repo goes public.
3. UI: approve a clickable design before any UI code.
4. Demo job: pick a safe, universal 2-minute job to film for evals and the demo.
