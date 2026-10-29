# @apprentice/store

Postgres persistence (ADR 0005): `guides`, `sessions`, `artifacts` (pipeline stage outputs) and `usage_events`, plus `PgBossQueue` for jobs. Documents are stored as jsonb and parsed with the domain schemas on every read. `migrate()` is idempotent.

Integration tests run when `TEST_DATABASE_URL` is set (CI starts a Postgres 16 service), and are skipped otherwise.
