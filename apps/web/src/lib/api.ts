import {
  AskResponse,
  BuildStatus,
  ClientMessage,
  CoachUpdate,
  Guide,
  RunAudit,
  RunReport,
  ServerMessage,
  type AskRequest,
  type ClientCoachEvent,
  type CreateGuideRequest,
  type GuideEditRequest,
} from "@apprentice/core";
import { z } from "zod";

export const API_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const ErrorBody = z.object({ error: z.string() });

/** Every response is parsed with the shared contract; a mismatch is an error, not a guess. */
export async function request<T extends z.ZodTypeAny>(
  path: string,
  schema: T,
  init: RequestInit = {},
  fetchImpl: typeof fetch = fetch,
): Promise<z.output<T>> {
  const res = await fetchImpl(`${API_URL}${path}`, init);
  const body: unknown = await res.json().catch(() => undefined);
  if (!res.ok) {
    const parsed = ErrorBody.safeParse(body);
    throw new ApiError(
      res.status,
      parsed.success ? parsed.data.error : `Request failed (${res.status})`,
    );
  }
  return schema.parse(body);
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const MediaRef = z.object({ kind: z.literal("url"), url: z.string(), mime: z.string().optional() });

export const api = {
  guides: () => request("/guides", z.object({ guides: z.array(Guide) })).then((r) => r.guides),
  guide: (id: string) => request(`/guides/${encodeURIComponent(id)}`, Guide),
  editGuide: (id: string, edit: GuideEditRequest) =>
    request(`/guides/${encodeURIComponent(id)}`, Guide, { ...json(edit), method: "PATCH" }),
  approve: (id: string) =>
    request(`/guides/${encodeURIComponent(id)}/approve`, Guide, { method: "POST" }),
  build: (id: string) => request(`/guides/${encodeURIComponent(id)}/build`, BuildStatus),
  createGuide: (body: CreateGuideRequest) =>
    request("/guides", z.object({ guideId: z.string(), jobId: z.string() }), json(body)),
  upload: (file: File) =>
    request("/uploads", z.object({ media: MediaRef, bytes: z.number() }), {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    }),
  startSession: (guideId: string) => request("/sessions", CoachUpdate, json({ guideId })),
  session: (id: string) => request(`/sessions/${encodeURIComponent(id)}`, CoachUpdate),
  event: (id: string, event: ClientCoachEvent) =>
    request(`/sessions/${encodeURIComponent(id)}/events`, CoachUpdate, json(event)),
  frames: (id: string, frames: Extract<ClientMessage, { type: "frames" }>["frames"]) =>
    request(`/sessions/${encodeURIComponent(id)}/frames`, CoachUpdate, json({ frames })),
  ask: (id: string, body: AskRequest) =>
    request(`/sessions/${encodeURIComponent(id)}/ask`, AskResponse, json(body)),
  audit: (id: string) => request(`/sessions/${encodeURIComponent(id)}/audit`, RunAudit),
  report: (id: string) => request(`/sessions/${encodeURIComponent(id)}/report`, RunReport),
};

export function referenceFrameUrl(guideId: string, t: number): string {
  return `${API_URL}/guides/${encodeURIComponent(guideId)}/frame?t=${t}`;
}

/** Any stored media by key: evidence frames and step diagrams. */
export function evidenceFrameUrl(key: string): string {
  return `${API_URL}/media/${key}`;
}

export function liveSocketUrl(sessionId: string): string {
  return `${API_URL.replace(/^http/, "ws")}/sessions/${encodeURIComponent(sessionId)}/live`;
}

export function parseServerMessage(data: unknown): ServerMessage | undefined {
  if (typeof data !== "string") return undefined;
  try {
    const parsed = ServerMessage.safeParse(JSON.parse(data));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
