import { MetaApiError, type FilesApi, type ResponseResult, type ResponsesApi } from "./client.js";

export interface RetryOptions {
  /** Attempts in total, including the first. */
  attempts?: number;
  baseDelayMs?: number;
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
}

const RETRYABLE = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

export function isRetryable(error: unknown): boolean {
  if (error instanceof MetaApiError) return RETRYABLE.has(error.status);
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function withBackoff<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const attempts = options.attempts ?? 4;
  const base = options.baseDelayMs ?? 2000;
  const sleep = options.sleep ?? defaultSleep;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= attempts || !isRetryable(error)) throw error;
      await sleep(base * 2 ** (attempt - 1));
    }
  }
}

/** Retries rate limits, server errors and timeouts with exponential backoff (2 s, 4 s, 8 s). */
export class RetryingMetaApi implements ResponsesApi, FilesApi {
  constructor(
    private readonly inner: ResponsesApi & FilesApi,
    private readonly options: RetryOptions = {},
  ) {}

  createResponse(body: Record<string, unknown>): Promise<ResponseResult> {
    return withBackoff(() => this.inner.createResponse(body), this.options);
  }

  uploadFile(data: Uint8Array, filename: string, mime: string): Promise<string> {
    return withBackoff(() => this.inner.uploadFile(data, filename, mime), this.options);
  }
}
