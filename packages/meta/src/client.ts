import { z } from "zod";

export interface MetaClientOptions {
  apiKey: string;
  baseUrl?: string;
  /** Injected for tests; defaults to global fetch. */
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export const DEFAULT_BASE_URL = "https://api.meta.ai/v1";

const ContentItem = z.object({ type: z.string(), text: z.string().optional() }).passthrough();

const ResponseBody = z.object({
  output: z
    .array(
      z
        .object({ type: z.string().optional(), content: z.array(ContentItem).nullish() })
        .passthrough(),
    )
    .default([]),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }).partial().optional(),
});

/** An image in a response, as base64 or as a URL to fetch. */
export const ResponseImage = z.object({
  mime: z.string().optional(),
  base64: z.string().optional(),
  url: z.string().optional(),
});
export type ResponseImage = z.infer<typeof ResponseImage>;

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

/**
 * Images from a Responses `output`. Muse Image's exact output shape was not documented when this
 * was written, so every plausible OpenAI-compatible form is accepted: an `image_generation_call`
 * item with a base64 `result`, or content items of an image type carrying `b64_json`,
 * `image_base64`, `data` or an `image_url` (string or `{ url }`). Run `pnpm --filter
 * @apprentice/meta probe` once with a key to confirm.
 */
export function extractImages(output: readonly Record<string, unknown>[]): ResponseImage[] {
  const images: ResponseImage[] = [];
  const push = (item: Record<string, unknown>) => {
    const nested = item.image_url;
    const url =
      str(nested) ??
      (nested && typeof nested === "object"
        ? str((nested as Record<string, unknown>).url)
        : undefined) ??
      str(item.url);
    const base64 =
      str(item.b64_json) ?? str(item.image_base64) ?? str(item.data) ?? str(item.result);
    const mime =
      str(item.mime_type) ??
      str(item.mime) ??
      (str(item.output_format) ? `image/${String(item.output_format)}` : undefined);
    if (base64 && base64.startsWith("data:")) {
      const [head, data] = base64.split(",", 2);
      images.push({ mime: head?.slice(5).split(";")[0], base64: data });
    } else if (base64 || url) {
      images.push({
        ...(mime ? { mime } : {}),
        ...(base64 ? { base64 } : {}),
        ...(url ? { url } : {}),
      });
    }
  };
  for (const item of output) {
    if (item.type === "image_generation_call") push(item);
    const content = Array.isArray(item.content) ? (item.content as Record<string, unknown>[]) : [];
    for (const c of content) if (typeof c.type === "string" && c.type.includes("image")) push(c);
  }
  return images;
}

export interface ResponseResult {
  text: string;
  /** Images in the output (Muse Image); absent for text-only models. */
  images?: ResponseImage[];
  inputTokens: number;
  outputTokens: number;
  /** Set by the response cache when the result was replayed instead of paid for. */
  cached?: boolean;
}

/** The Responses endpoint, as the adapters see it. Cache, retry and fakes implement it too. */
export interface ResponsesApi {
  createResponse(body: Record<string, unknown>): Promise<ResponseResult>;
}

/** Speech to text (Voice Transcribe). */
export interface TranscribeApi {
  transcribe(input: {
    model: string;
    data: Uint8Array;
    filename: string;
    mime: string;
  }): Promise<{ text: string; cached?: boolean }>;
}

/** The Files endpoint: upload once, then refer to the file by id. */
export interface FilesApi {
  uploadFile(data: Uint8Array, filename: string, mime: string): Promise<string>;
}

export class MetaApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`Meta Model API ${status}: ${body.slice(0, 300)}`);
    this.name = "MetaApiError";
  }
}

/** Thin, typed client for the Responses and Files endpoints. The key is never logged. */
export class MetaClient implements ResponsesApi, FilesApi, TranscribeApi {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: MetaClientOptions) {
    if (!options.apiKey) throw new Error("MetaClient needs an apiKey");
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 600_000;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { Authorization: `Bearer ${this.options.apiKey}`, ...extra };
  }

  async createResponse(body: Record<string, unknown>): Promise<ResponseResult> {
    const res = await this.fetchImpl(`${this.baseUrl}/responses`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ ...body, stream: false }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new MetaApiError(res.status, await res.text());
    const parsed = ResponseBody.parse(await res.json());
    const text = parsed.output
      .flatMap((o) => o.content ?? [])
      .filter((c) => c.type === "output_text" || c.type === "text")
      .map((c) => c.text ?? "")
      .join("\n");
    const images = extractImages(parsed.output);
    return {
      text,
      ...(images.length ? { images } : {}),
      inputTokens: parsed.usage?.input_tokens ?? 0,
      outputTokens: parsed.usage?.output_tokens ?? 0,
    };
  }

  async uploadFile(data: Uint8Array, filename: string, mime: string): Promise<string> {
    const form = new FormData();
    form.append("purpose", "user_data");
    form.append("file", new Blob([data], { type: mime }), filename);
    const res = await this.fetchImpl(`${this.baseUrl}/files`, {
      method: "POST",
      headers: this.headers(),
      body: form,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new MetaApiError(res.status, await res.text());
    return z.object({ id: z.string() }).parse(await res.json()).id;
  }

  /**
   * Muse Voice Transcribe, confirmed by the probe on 27 Oct 2026 (ADR 0007): `POST /asr/transcribe`,
   * multipart with a JSON `request` part (model, WAV encoding, push-to-talk) and a WAV `audio` part.
   * The whole clip's text is in `transcript`.
   */
  async transcribe(input: {
    model: string;
    data: Uint8Array;
    filename: string;
    mime: string;
  }): Promise<{ text: string }> {
    const form = new FormData();
    const settings = { model: input.model, audioEncoding: "WAV", mode: "PUSH_TO_TALK" };
    form.append("request", new Blob([JSON.stringify(settings)], { type: "application/json" }));
    form.append("audio", new Blob([input.data], { type: input.mime }), input.filename);
    const res = await this.fetchImpl(`${this.baseUrl}/asr/transcribe`, {
      method: "POST",
      headers: this.headers({ Accept: "application/json" }),
      body: form,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new MetaApiError(res.status, await res.text());
    const body = z.object({ transcript: z.string().default("") }).parse(await res.json());
    return { text: body.transcript };
  }
}
