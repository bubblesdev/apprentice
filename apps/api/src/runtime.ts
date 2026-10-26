import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { CoachPolicy, StepVerifier } from "@apprentice/coach";
import {
  InMemoryMediaStore,
  systemClock,
  type Clock,
  type FrameExtractor,
  type UsageScope,
} from "@apprentice/core";
import { CostMeter, MetaEnv, createMetaAdapters } from "@apprentice/meta";
import { FakeFrameExtractor } from "@apprentice/meta/fake";
import {
  BUILD_GUIDE_JOB,
  FfmpegFrameExtractor,
  buildGuideHandler,
  ingestDocument,
  ingestRemoteVideo,
  type BuildGuidePayload,
} from "@apprentice/pipeline";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { z } from "zod";
import { createApp } from "./app.js";
import { CoachService, type ReferenceResolver, type SessionAdapters } from "./coach-service.js";
import { memoryPersistence, postgresPersistence } from "./persistence.js";

export const ApiEnv = MetaEnv.extend({
  PORT: z.coerce.number().int().positive().default(8787),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),
  /** Hard caps on Meta spend per guide build and per coaching session. */
  GUIDE_BUDGET_USD: z.coerce.number().positive().default(1.5),
  SESSION_BUDGET_USD: z.coerce.number().positive().default(0.5),
  /** Uploaded and downloaded source videos. With a separate worker, both must see this directory. */
  UPLOAD_DIR: z.string().min(1).default(".data/uploads"),
  UPLOAD_MAX_MB: z.coerce.number().positive().default(300),
  /** Postgres for guides, sessions, artifacts and pg-boss jobs; without it everything is in memory. */
  DATABASE_URL: z.string().min(1).optional(),
  /** Build the recorded PS1 guide at start-up in fake mode, so the web app has something to coach. */
  SEED_FIXTURE_GUIDE: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
});
export type ApiEnv = z.infer<typeof ApiEnv>;

export interface RuntimeOptions {
  clock?: Clock;
  newId?: () => string;
  fixturesDir?: string;
}

/**
 * Wires the API. With DATABASE_URL: Postgres repositories, and guide builds queued on pg-boss for
 * apps/worker. Without: in-memory repositories and builds run inline in this process. Meta
 * adapters (live, replay or fake) are metered and capped per guide and per session.
 */
export async function createRuntime(env: ApiEnv, options: RuntimeOptions = {}) {
  const clock = options.clock ?? systemClock;
  const newId = options.newId ?? randomUUID;
  const persistence = env.DATABASE_URL
    ? await postgresPersistence(env.DATABASE_URL, [BUILD_GUIDE_JOB])
    : memoryPersistence();
  const { guides, sessions } = persistence;
  const meter = (scope: UsageScope, capUsd: number) =>
    new CostMeter({ scope, capUsd, clock, onEvent: persistence.recordUsage });
  const adapters = (m: CostMeter) =>
    createMetaAdapters({
      env,
      meter: m,
      ...(options.fixturesDir ? { fixturesDir: options.fixturesDir } : {}),
    });
  const probe = await adapters(new CostMeter({ scope: { kind: "eval", id: "probe" } }));
  const frames: FrameExtractor =
    probe.mode === "fake"
      ? new FakeFrameExtractor(env.APPRENTICE_FIXTURE_JOB)
      : new FfmpegFrameExtractor();
  const media = new InMemoryMediaStore();
  const uploads = { dir: resolve(env.UPLOAD_DIR), maxBytes: env.UPLOAD_MAX_MB * 1e6 };
  const policy = CoachPolicy.parse({});

  const queue = await persistence.createQueue({
    [BUILD_GUIDE_JOB]: buildGuideHandler({
      guides,
      store: persistence.artifacts,
      frames,
      builds: persistence.builds,
      media,
      clock,
      prepare: async (p) => ingestDocument(await ingestRemoteVideo(p, uploads)),
      adaptersFor: (guideId) =>
        adapters(meter({ kind: "guide", id: guideId }, env.GUIDE_BUDGET_USD)),
    }),
  });

  const references: ReferenceResolver = (guide, step) => {
    const video = { kind: "url" as const, url: guide.source.location };
    return Promise.all(step.referenceTimesS.map((t) => frames.frameAt(video, t)));
  };

  const sessionAdapters = new Map<string, Promise<SessionAdapters>>();
  const coach = new CoachService({
    guides,
    sessions,
    media,
    policy,
    clock,
    newId,
    references,
    adaptersFor: (sessionId) => {
      const existing = sessionAdapters.get(sessionId);
      if (existing) return existing;
      const created = adapters(
        meter({ kind: "session", id: sessionId }, env.SESSION_BUDGET_USD),
      ).then(({ reasoner, segmenter, transcriber, auditor }) => ({
        verifier: new StepVerifier({ reasoner, segmenter, policy }),
        reasoner,
        transcriber,
        auditor,
      }));
      sessionAdapters.set(sessionId, created);
      return created;
    },
  });

  const app = new Hono();
  const nodeWs = createNodeWebSocket({ app });
  createApp(
    {
      guides,
      builds: persistence.builds,
      queue,
      coach,
      media,
      frames,
      uploads,
      newId,
      corsOrigin: env.CORS_ORIGIN,
      upgradeWebSocket: nodeWs.upgradeWebSocket,
    },
    app,
  );

  /** In fake mode, queue the recorded PS1 job so a guide is ready to coach. */
  async function seed(): Promise<string | undefined> {
    if (probe.mode !== "fake" || !env.SEED_FIXTURE_GUIDE) return undefined;
    const guideId = "ps1-buttons";
    const source = {
      id: "ps1-buttons-source",
      kind: "video" as const,
      title: "Fix sticky PlayStation buttons",
      location: `fixture://${env.APPRENTICE_FIXTURE_JOB}/source`,
      durationS: 463.8,
      attribution:
        '"How to Fix Sticking or Squeaking Buttons on the PlayStation 1", Wikimedia Commons, CC BY 3.0',
    };
    await guides.put({
      id: guideId,
      title: source.title,
      status: "building",
      source,
      steps: [],
      version: 1,
    });
    const payload: BuildGuidePayload = {
      guideId,
      source,
      media: { kind: "url", url: source.location },
    };
    await queue.enqueue(BUILD_GUIDE_JOB, payload);
    return guideId;
  }

  return {
    app,
    injectWebSocket: nodeWs.injectWebSocket,
    mode: probe.mode,
    persistence: persistence.kind,
    guides,
    sessions,
    media,
    queue,
    coach,
    seed,
    close: () => persistence.close(),
  };
}
