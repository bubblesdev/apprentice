import { z } from "zod";

export interface MetaClientOptions {
  apiKey: string;
  baseUrl?: string;
  /** Injected for tests; defaults to global fetch. */
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export const DEFAULT_BASE_URL = "https://api.meta.ai/v1";

const ResponseBody = z.object({
  output: z
    .array(
      z.object({
        content: z.array(z.object({ type: z.string(), text: z.string().optional() })).nullish(),
      }),
    )
    .default([]),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }).partial().optional(),
});

export interface ResponseResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  /** Set by the response cache when the result was replayed instead of paid for. */
  cached?: boolean;
}

/** The Responses endpoint, as the adapters see it. Cache, retry and fakes implement it too. */
export interface ResponsesApi {
  createResponse(body: Record<string, unknown>): Promise<ResponseResult>;
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
export class MetaClient implements ResponsesApi, FilesApi {
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
    return {
      text,
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
}
