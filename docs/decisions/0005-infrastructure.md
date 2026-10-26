# 0005: Postgres, R2, Fly.io

Date: 2026-10-26. Status: accepted.
Context: need durable jobs, media storage without egress fees, and simple hosting with separate api and worker processes.
Decision: Postgres (Neon) with pg-boss for jobs, Cloudflare R2 for media with signed URLs, Fly.io for api and worker, static web on Cloudflare Pages or Vercel.
Consequences: no Redis to run; secrets only in platform environment settings.
