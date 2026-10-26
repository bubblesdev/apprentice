import {
  BuildStatus,
  Guide,
  Session,
  UsageEvent,
  type BuildStatusRepository,
  type GuideRepository,
  type SessionRepository,
} from "@apprentice/core";

/** The slice of `pg.Pool` the repositories use, so tests can pass a client or a pool. */
export interface Sql {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: R[] }>;
}

/**
 * Documents are stored as validated JSON (jsonb) keyed by id: the domain schemas stay the single
 * source of truth, and every read is parsed again, so a stale row fails loudly instead of
 * travelling into the coach.
 */
export const MIGRATIONS = [
  `create table if not exists guides (
     id text primary key,
     doc jsonb not null,
     updated_at timestamptz not null default now())`,
  `create table if not exists sessions (
     id text primary key,
     guide_id text not null,
     doc jsonb not null,
     updated_at timestamptz not null default now())`,
  `create table if not exists artifacts (
     key text primary key,
     value jsonb not null,
     created_at timestamptz not null default now())`,
  `create table if not exists usage_events (
     id bigserial primary key,
     scope_kind text not null,
     scope_id text not null,
     operation text not null,
     cost_usd double precision not null,
     cached boolean not null,
     doc jsonb not null,
     at timestamptz not null)`,
  `create index if not exists usage_events_scope on usage_events (scope_kind, scope_id)`,
  `create index if not exists sessions_guide on sessions (guide_id)`,
  `create table if not exists guide_builds (
     guide_id text primary key,
     doc jsonb not null,
     updated_at timestamptz not null default now())`,
];

export async function migrate(sql: Sql): Promise<void> {
  for (const statement of MIGRATIONS) await sql.query(statement);
}

export class PgGuideRepository implements GuideRepository {
  constructor(private readonly sql: Sql) {}

  async get(id: string): Promise<Guide | undefined> {
    const { rows } = await this.sql.query<{ doc: unknown }>(
      "select doc from guides where id = $1",
      [id],
    );
    return rows[0] ? Guide.parse(rows[0].doc) : undefined;
  }

  async put(guide: Guide): Promise<void> {
    await this.sql.query(
      `insert into guides (id, doc) values ($1, $2)
       on conflict (id) do update set doc = excluded.doc, updated_at = now()`,
      [guide.id, JSON.stringify(Guide.parse(guide))],
    );
  }

  async list(): Promise<Guide[]> {
    const { rows } = await this.sql.query<{ doc: unknown }>(
      "select doc from guides order by updated_at desc",
    );
    return rows.map((r) => Guide.parse(r.doc));
  }
}

export class PgSessionRepository implements SessionRepository {
  constructor(private readonly sql: Sql) {}

  async get(id: string): Promise<Session | undefined> {
    const { rows } = await this.sql.query<{ doc: unknown }>(
      "select doc from sessions where id = $1",
      [id],
    );
    return rows[0] ? Session.parse(rows[0].doc) : undefined;
  }

  async put(session: Session): Promise<void> {
    await this.sql.query(
      `insert into sessions (id, guide_id, doc) values ($1, $2, $3)
       on conflict (id) do update set doc = excluded.doc, updated_at = now()`,
      [session.id, session.guideId, JSON.stringify(Session.parse(session))],
    );
  }

  async listByGuide(guideId: string): Promise<Session[]> {
    const { rows } = await this.sql.query<{ doc: unknown }>(
      "select doc from sessions where guide_id = $1 order by updated_at",
      [guideId],
    );
    return rows.map((r) => Session.parse(r.doc));
  }
}

/** Pipeline stage outputs (structurally the pipeline's ArtifactStore). Write-once per key. */
export class PgArtifactStore {
  constructor(private readonly sql: Sql) {}

  async get(key: string): Promise<unknown> {
    const { rows } = await this.sql.query<{ value: unknown }>(
      "select value from artifacts where key = $1",
      [key],
    );
    return rows[0]?.value;
  }

  async put(key: string, value: unknown): Promise<void> {
    await this.sql.query(
      `insert into artifacts (key, value) values ($1, $2)
       on conflict (key) do update set value = excluded.value`,
      [key, JSON.stringify(value)],
    );
  }
}

/** Persists metered model calls for cost reports (CostMeter's onEvent). */
export class PgUsageLog {
  constructor(private readonly sql: Sql) {}

  async record(event: UsageEvent): Promise<void> {
    const e = UsageEvent.parse(event);
    await this.sql.query(
      `insert into usage_events (scope_kind, scope_id, operation, cost_usd, cached, doc, at)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [e.scope.kind, e.scope.id, e.operation, e.costUsd, e.cached, JSON.stringify(e), e.at],
    );
  }

  async list(scope: UsageEvent["scope"]): Promise<UsageEvent[]> {
    const { rows } = await this.sql.query<{ doc: unknown }>(
      "select doc from usage_events where scope_kind = $1 and scope_id = $2 order by id",
      [scope.kind, scope.id],
    );
    return rows.map((r) => UsageEvent.parse(r.doc));
  }
}

export class PgBuildStatusRepository implements BuildStatusRepository {
  constructor(private readonly sql: Sql) {}

  async get(guideId: string): Promise<BuildStatus | undefined> {
    const { rows } = await this.sql.query<{ doc: unknown }>(
      "select doc from guide_builds where guide_id = $1",
      [guideId],
    );
    return rows[0] ? BuildStatus.parse(rows[0].doc) : undefined;
  }

  async put(status: BuildStatus): Promise<void> {
    await this.sql.query(
      `insert into guide_builds (guide_id, doc) values ($1, $2)
       on conflict (guide_id) do update set doc = excluded.doc, updated_at = now()`,
      [status.guideId, JSON.stringify(BuildStatus.parse(status))],
    );
  }
}
