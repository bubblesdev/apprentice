# @apprentice/meta

Meta Model API adapters for the ports in `@apprentice/core`.

| Module             | What it does                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| `client.ts`        | `MetaClient` for the Responses and Files endpoints; the key is never logged                             |
| `retry.ts`         | `RetryingMetaApi`: backoff on 429, 5xx and timeouts (2 s, 4 s, 8 s)                                     |
| `cache.ts`         | `CachedMetaApi`: each distinct request is paid for once, then replayed (memory or file store)           |
| `meter.ts`         | `CostMeter`: records every call against a guide, session or eval scope; enforces a hard cap             |
| `spark.ts`         | `SparkReasoner` (Muse Spark): draft steps from video or text, refine step boundaries, judge a live step |
| `sam-segmenter.ts` | `SamSegmenter` (SAM 3.1): track a concept in a clip, find it in an image                                |
| `prompts.ts`       | Every prompt, including the strict-instructor judge from `spike/step_check.py`                          |
| `adapters.ts`      | `createMetaAdapters` picks `live`, `replay` or `fake` from validated env                                |
| `fake/` (`/fake`)  | Fixture loader and fakes that replay `fixtures/`; unrecorded inputs answer `unclear`, never a guess     |

## Modes

`APPRENTICE_ADAPTERS=auto` (default) is live when `META_MODEL_API_KEY` is set and fake otherwise. `replay` serves only responses recorded in `META_CACHE_DIR` and fails on a miss, so it can never spend credits. See ADR 0006.

## Fixture media

Fixtures hold model outputs, not media. Fakes receive placeholder media such as `fixture://ps1_buttons/trainee?step=4&case=correct`, and `FakeReasoner` replays the verdict Muse Spark gave for exactly that case in spike 2.
