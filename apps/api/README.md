# @apprentice/api

Hono HTTP and WebSocket API. Every body and message is parsed with the shared contract in `@apprentice/core` (`api.ts`).

```bash
pnpm --filter @apprentice/api build && pnpm --filter @apprentice/api start
```

Without `DATABASE_URL` everything is in memory and guide builds run inline. In fake mode the recorded PS1 guide (`ps1-buttons`) is built at start-up. With `DATABASE_URL`, guides, sessions, pipeline artifacts and usage events live in Postgres, and builds are queued on pg-boss for `apps/worker`.

| Route                            | What it does                                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `GET /health`                    | Liveness                                                                                             |
| `GET /guides`, `GET /guides/:id` | List and read guides                                                                                 |
| `POST /guides`                   | Save a `building` guide and queue the build; `202 { guideId, jobId }`                                |
| `POST /guides/:id/approve`       | Mark a draft approved (a rebuild never overwrites it)                                                |
| `POST /sessions`                 | Start coaching a guide; returns a `CoachUpdate`                                                      |
| `GET /sessions/:id`              | Current `CoachUpdate`                                                                                |
| `POST /sessions/:id/events`      | `begin`, `check`, `next`, `acknowledge`, `override`, `end`                                           |
| `POST /sessions/:id/frames`      | One sample of live frames (HTTP fallback for the WebSocket)                                          |
| `GET /sessions/:id/report`       | Run report with evidence                                                                             |
| `GET /sessions/:id/live`         | WebSocket: send `{type:"event"}` or `{type:"frames"}`, receive `{type:"update"}` or `{type:"error"}` |

Invalid bodies return 400 with zod issues; events that do not fit the coach state return 409. Every session gets its own metered Meta adapters with a hard cap (`SESSION_BUDGET_USD`, default $0.50); each guide build is capped by `GUIDE_BUDGET_USD` (default $1.50).

`APPRENTICE_FAKE_JUDGE=pass` (fake mode only) passes every live check so the coach UI can be walked end to end in development. It never runs against real models.

Not built yet: media ingest (upload to the Meta Files API, direct video URL download, PDF text extraction) and R2 for evidence frames; `POST /guides` takes an already uploaded media reference.
