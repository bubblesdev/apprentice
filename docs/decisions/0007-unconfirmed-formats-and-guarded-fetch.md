# 0007: Unconfirmed Meta formats are isolated and probed; outbound fetches are guarded

Date: 2026-10-26. Status: accepted.
Context: Muse Image, Voice Transcribe and Muse Wonder adapters were written without a key and without access to Meta's API reference (blocked by this environment's network policy). Only Muse Spark and SAM 3.1 formats were confirmed by the day-1 spikes. Separately, ingest now fetches user-supplied links (direct videos, help pages, PDFs) from the server.
Decision: each unconfirmed format sits behind one small function (`extractImages`, `MetaClient.transcribe`, `WonderAuditor`'s JSON schema) that accepts every plausible OpenAI-compatible shape, and `pnpm --filter @apprentice/meta probe -- --yes-spend` calls each model once (about $0.02), saves the raw responses and reports whether the parsers understand them. Fakes never imitate these models: they return labelled placeholders (a "Muse Image not called" SVG, an empty transcript, a rules-based audit marked `source: "rules"`). All server-side fetches of user links go through `safeFetch`, which refuses hosts resolving to private, loopback, link-local or CGNAT addresses and re-checks every redirect.
Consequences: one cheap probe run before the demo confirms or pinpoints any mismatch; no fake output can be mistaken for a model's; the server cannot be used to reach its own network.

## Probe results (27 Oct 2026, James's key, about $0.02)

- **Muse Spark** (`muse-spark-1.3`) and **Muse Wonder** (`muse-wonder-1.0`): Responses API as assumed. `output` holds a `reasoning` item then a `message` with `output_text`. Reasoning tokens are billed inside `output_tokens` (a one-word reply used 135 reasoning tokens), so verdict prompts should ask for low reasoning effort where accuracy allows.
- **Muse Image** (`muse-image-1.0`): Responses API; the picture arrives as an `image_generation_call` item with base64 `result`, which `extractImages` already parses. Billed flat per image even though `usage` reports tokens.
- **Muse Voice Transcribe** (`muse-voice-transcribe-1.0`): NOT the OpenAI-compatible `/audio/transcriptions` (404). The real endpoint is `POST /asr/transcribe`, multipart with a JSON `request` part (`model`, `audioEncoding: "WAV"`, `mode: "PUSH_TO_TALK"`) and a WAV `audio` part; the reply is `{ sessionId, transcript, audioDurationMs, turns }`. `MetaClient.transcribe` and the probe now use it. Silence returns an empty `transcript`.
- The probe also read response bodies twice when a reply was not JSON; it now reads each body once, and `--only=<name>` re-checks one model.
