# @apprentice/worker

Consumes `build-guide` jobs from pg-boss and runs `@apprentice/pipeline` with metered, capped Meta adapters (`GUIDE_BUDGET_USD`). Jobs retry with backoff; retries are cheap because finished pipeline stages are reused from the `artifacts` table.

```bash
DATABASE_URL=postgres://... pnpm --filter @apprentice/worker build
DATABASE_URL=postgres://... pnpm --filter @apprentice/worker start
```

Real frames are extracted with ffmpeg from a `file:` URL (`frameSource` in the job), so the worker needs ffmpeg and the source video on disk.
