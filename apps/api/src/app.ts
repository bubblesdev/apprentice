import { guideInsights } from "@apprentice/coach";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AskRequest,
  ClientMessage,
  CreateGuideRequest,
  CreateSessionRequest,
  FramesRequest,
  GuideEditRequest,
  applyGuideEdit,
  ClientCoachEvent,
  type BuildStatusRepository,
  type FrameExtractor,
  type GuideRepository,
  type JobQueue,
  type MediaStore,
  type ServerMessage,
  type SessionRepository,
} from "@apprentice/core";
import {
  BUILD_GUIDE_JOB,
  IngestError,
  storeStream,
  type BuildGuidePayload,
} from "@apprentice/pipeline";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import type { UpgradeWebSocket } from "hono/ws";
import type { z } from "zod";
import { CoachError, type CoachService, type IncomingFrame } from "./coach-service.js";

export interface AppDeps {
  guides: GuideRepository;
  sessions: SessionRepository;
  builds: BuildStatusRepository;
  queue: JobQueue;
  media: MediaStore;
  frames: FrameExtractor;
  uploads: { dir: string; maxBytes: number };
  coach: CoachService;
  newId: () => string;
  corsOrigin: string;
  upgradeWebSocket?: UpgradeWebSocket;
}

const STATUS = { not_found: 404, not_ready: 409, invalid_event: 409, unheard: 422 } as const;

const UPLOAD_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/**
 * Media a client may point a build at. Local files are allowed only inside the uploads directory,
 * so a request can never make the worker read (and send to a model) any other file on the server.
 */
function allowedMediaUrl(url: string, uploadsDir: string): boolean {
  if (url.startsWith("file:")) {
    try {
      return resolve(fileURLToPath(url)).startsWith(uploadsDir + sep);
    } catch {
      return false;
    }
  }
  return /^(https?|data|fixture):/i.test(url);
}

function decodeFrames(frames: z.infer<typeof FramesRequest>["frames"]): IncomingFrame[] {
  return frames.map((f) => ({ mime: f.mime, data: new Uint8Array(Buffer.from(f.data, "base64")) }));
}

async function body<T extends z.ZodTypeAny>(
  c: Context,
  schema: T,
): Promise<z.output<T> | Response> {
  const parsed = schema.safeParse(await c.req.json().catch(() => undefined));
  return parsed.success
    ? parsed.data
    : c.json({ error: "Invalid request", issues: parsed.error.issues }, 400);
}

/** HTTP routes and the live WebSocket. Every body and message is parsed with the shared contract. */
export function createApp(deps: AppDeps, app: Hono = new Hono()): Hono {
  app.use("*", cors({ origin: deps.corsOrigin }));

  app.onError((error, c) => {
    if (error instanceof CoachError) return c.json({ error: error.message }, STATUS[error.code]);
    console.error(error);
    return c.json({ error: "Something went wrong" }, 500);
  });

  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/guides", async (c) => c.json({ guides: await deps.guides.list() }));

  app.get("/guides/:id", async (c) => {
    const guide = await deps.guides.get(c.req.param("id"));
    return guide ? c.json(guide) : c.json({ error: "Guide not found" }, 404);
  });

  /** Where trainees struggle across runs of the guide's current version. */
  app.get("/guides/:id/insights", async (c) => {
    const guide = await deps.guides.get(c.req.param("id"));
    if (!guide) return c.json({ error: "Guide not found" }, 404);
    return c.json(guideInsights(guide, await deps.sessions.listByGuide(guide.id)));
  });

  app.get("/guides/:id/build", async (c) => {
    const status = await deps.builds.get(c.req.param("id"));
    return status ? c.json(status) : c.json({ error: "No build for this guide" }, 404);
  });

  /** An expert reference frame, as JPEG, when the source video can be read here. */
  app.get("/guides/:id/frame", async (c) => {
    const guide = await deps.guides.get(c.req.param("id"));
    const t = Number(c.req.query("t"));
    if (!guide || !Number.isFinite(t) || t < 0) return c.json({ error: "Frame not found" }, 404);
    if (!allowedMediaUrl(guide.source.location, deps.uploads.dir))
      return c.json({ error: "Frame not found" }, 404);
    const frame = await deps.frames
      .frameAt({ kind: "url", url: guide.source.location }, t)
      .catch(() => undefined);
    if (frame?.kind !== "bytes") return c.json({ error: "Frame not available" }, 404);
    return c.body(Buffer.from(frame.data), 200, {
      "Content-Type": frame.mime,
      "Cache-Control": "public, max-age=86400, immutable",
    });
  });

  /** Upload a source video or PDF manual. The body is the raw file; it is stored under a hash of its content. */
  app.post("/uploads", async (c) => {
    const mime = (c.req.header("content-type") ?? "").split(";")[0]?.trim() ?? "";
    if (!UPLOAD_TYPES.has(mime))
      return c.json({ error: "Upload an MP4, MOV or WebM video, a PDF, or a photo" }, 415);
    const stream = c.req.raw.body;
    if (!stream) return c.json({ error: "The file is empty" }, 400);
    try {
      const stored = await storeStream(stream, { ...deps.uploads, mime });
      return c.json({ media: { kind: "url", url: stored.url, mime }, bytes: stored.bytes }, 201);
    } catch (error) {
      if (error instanceof IngestError) return c.json({ error: error.message }, 413);
      throw error;
    }
  });

  /** Evidence frames captured during live sessions, and step diagrams. */
  app.get("/media/*", async (c) => {
    const key = c.req.path.slice("/media/".length);
    const allowed =
      /^sessions\/[\w-]+\/frames\/\d+\.jpg$/.test(key) ||
      /^guides\/[\w-]+\/diagrams\/[\w-]+\.(png|jpg|webp|svg)$/.test(key);
    if (!allowed) return c.json({ error: "Not found" }, 404);
    const item = await deps.media.get(key);
    if (!item) return c.json({ error: "Not found" }, 404);
    return c.body(Buffer.from(item.data), 200, {
      "Content-Type": item.mime,
      "Cache-Control": key.startsWith("guides/")
        ? "public, max-age=86400, immutable"
        : "private, max-age=3600",
      // Media is only ever shown as an image; an SVG opened directly may not run script.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
    });
  });

  app.post("/guides", async (c) => {
    const req = await body(c, CreateGuideRequest);
    if (req instanceof Response) return req;
    if (req.pages && req.source.kind !== "document")
      return c.json({ error: "Manual pages need a document source" }, 400);
    const urls = [req.media, req.frameSource, ...(req.pages ?? [])].flatMap((m) =>
      m?.kind === "url" ? [m.url] : [],
    );
    if (req.source.location.includes(":")) urls.push(req.source.location);
    if (urls.some((u) => !allowedMediaUrl(u, deps.uploads.dir))) {
      return c.json({ error: "That media location is not allowed" }, 400);
    }
    const guideId = deps.newId();
    const source = { id: deps.newId(), ...req.source };
    await deps.guides.put({
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
      media: req.media,
      ...(req.frameSource ? { frameSource: req.frameSource } : {}),
      ...(req.documentText ? { documentText: req.documentText } : {}),
      ...(req.pages ? { pages: req.pages } : {}),
    };
    const jobId = await deps.queue.enqueue(BUILD_GUIDE_JOB, payload);
    return c.json({ guideId, jobId }, 202);
  });

  app.patch("/guides/:id", async (c) => {
    const req = await body(c, GuideEditRequest);
    if (req instanceof Response) return req;
    const guide = await deps.guides.get(c.req.param("id"));
    if (!guide) return c.json({ error: "Guide not found" }, 404);
    const result = applyGuideEdit(guide, req);
    if (!result.ok)
      return c.json({ error: result.message }, result.reason === "invalid" ? 400 : 409);
    await deps.guides.put(result.guide);
    return c.json(result.guide);
  });

  app.post("/guides/:id/approve", async (c) => {
    const guide = await deps.guides.get(c.req.param("id"));
    if (!guide) return c.json({ error: "Guide not found" }, 404);
    if (guide.status === "building")
      return c.json({ error: "This guide is still being built" }, 409);
    const approved = { ...guide, status: "approved" as const };
    await deps.guides.put(approved);
    return c.json(approved);
  });

  app.post("/sessions", async (c) => {
    const req = await body(c, CreateSessionRequest);
    if (req instanceof Response) return req;
    return c.json(await deps.coach.start(req.guideId), 201);
  });

  app.get("/sessions/:id", (c) => c.json(deps.coach.get(c.req.param("id"))));

  app.get("/sessions/:id/report", (c) => c.json(deps.coach.report(c.req.param("id"))));

  app.get("/sessions/:id/audit", async (c) => c.json(await deps.coach.audit(c.req.param("id"))));

  app.post("/sessions/:id/events", async (c) => {
    const req = await body(c, ClientCoachEvent);
    if (req instanceof Response) return req;
    return c.json(await deps.coach.dispatch(c.req.param("id"), req));
  });

  app.post("/sessions/:id/ask", async (c) => {
    const req = await body(c, AskRequest);
    if (req instanceof Response) return req;
    const question = req.audio
      ? {
          audio: {
            kind: "bytes" as const,
            mime: req.audio.mime,
            data: new Uint8Array(Buffer.from(req.audio.data, "base64")),
          },
        }
      : { text: req.text ?? "" };
    return c.json(await deps.coach.ask(c.req.param("id"), question));
  });

  /** HTTP fallback for networks that block WebSockets. */
  app.post("/sessions/:id/frames", async (c) => {
    const req = await body(c, FramesRequest);
    if (req instanceof Response) return req;
    return c.json(await deps.coach.submitFrames(c.req.param("id"), decodeFrames(req.frames)));
  });

  const upgrade = deps.upgradeWebSocket;
  if (upgrade) {
    app.get(
      "/sessions/:id/live",
      upgrade((c) => {
        const sessionId = c.req.param("id") ?? "";
        return {
          onMessage: async (message, ws) => {
            const send = (m: ServerMessage) => ws.send(JSON.stringify(m));
            let raw: unknown;
            try {
              raw = JSON.parse(typeof message.data === "string" ? message.data : "");
            } catch {
              send({ type: "error", message: "Messages must be JSON" });
              return;
            }
            const parsed = ClientMessage.safeParse(raw);
            if (!parsed.success) {
              send({ type: "error", message: "Unknown message" });
              return;
            }
            try {
              const update =
                parsed.data.type === "event"
                  ? await deps.coach.dispatch(sessionId, parsed.data.event)
                  : await deps.coach.submitFrames(sessionId, decodeFrames(parsed.data.frames));
              send({ type: "update", update });
            } catch (error) {
              send({
                type: "error",
                message: error instanceof CoachError ? error.message : "Something went wrong",
              });
              if (!(error instanceof CoachError)) console.error(error);
            }
          },
        };
      }),
    );
  }

  return app;
}
