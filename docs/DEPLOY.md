# Deploy

ADR 0005: Postgres on Neon, media on a Fly volume (or Cloudflare R2), API on Fly.io, the PWA on Cloudflare Pages. Nothing here holds a secret.

## API (Fly.io)

```bash
fly launch --no-deploy --copy-config        # once; creates the app from fly.toml
fly volumes create apprentice_data --size 3 # media, uploads and the Meta response cache
fly secrets set META_MODEL_API_KEY=... DATABASE_URL=postgres://...neon.../apprentice
fly scale count app=1 worker=0
fly deploy
```

`BUILD_JOBS=inline` lets the one API machine build guides itself, so one machine and one volume run everything. To scale builds out: `BUILD_JOBS=queue`, `MEDIA_STORE=r2` with the `R2_*` secrets, and `fly scale count worker=1`; uploads must then live where the worker can read them.

`META_CACHE_DIR` on the volume means every Meta request is paid for once across deploys (ADR 0006). Budget caps: `GUIDE_BUDGET_USD`, `SESSION_BUDGET_USD`.

## Web (Cloudflare Pages)

- Build command: `pnpm install --frozen-lockfile && pnpm turbo run build --filter=@apprentice/web...`
- Output directory: `apps/web/dist`
- Environment: `VITE_API_URL=https://apprentice-api.fly.dev`

`apps/web/public/_redirects` serves `index.html` for every route. Set the API's `CORS_ORIGIN` to the Pages URL.

## Before the demo

1. `pnpm --filter @apprentice/meta probe -- --yes-spend` once with the key (about $0.02): confirms the response formats of Muse Image, Voice Transcribe and Muse Wonder and records them.
2. Build the demo guide once; rehearsals then replay cached responses at no cost.
3. `pnpm e2e` locally against the build.
