import {
  ClientMessage,
  CreateGuideRequest,
  CreateSessionRequest,
  FramesRequest,
  ClientCoachEvent,
  type GuideRepository,
  type JobQueue,
  type ServerMessage,
} from "@apprentice/core";
import { BUILD_GUIDE_JOB, type BuildGuidePayload } from "@apprentice/pipeline";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import type { UpgradeWebSocket } from "hono/ws";
import type { z } from "zod";
import { CoachError, type CoachService, type IncomingFrame } from "./coach-service.js";

export interface AppDeps {
  guides: GuideRepository;
  queue: JobQueue;
  coach: CoachService;
  newId: () => string;
  corsOrigin: string;
  upgradeWebSocket?: UpgradeWebSocket;
}

const STATUS = { not_found: 404, not_ready: 409, invalid_event: 409 } as const;

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

  app.post("/guides", async (c) => {
    const req = await body(c, CreateGuideRequest);
    if (req instanceof Response) return req;
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
    };
    const jobId = await deps.queue.enqueue(BUILD_GUIDE_JOB, payload);
    return c.json({ guideId, jobId }, 202);
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

  app.post("/sessions/:id/events", async (c) => {
    const req = await body(c, ClientCoachEvent);
    if (req instanceof Response) return req;
    return c.json(await deps.coach.dispatch(c.req.param("id"), req));
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
