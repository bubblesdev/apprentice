import { describe, expect, it } from "vitest";
import { MetaApiError, type FilesApi, type ResponseResult, type ResponsesApi } from "./client.js";
import { RetryingMetaApi, isRetryable } from "./retry.js";

function flaky(failures: unknown[]): ResponsesApi & FilesApi & { attempts: number } {
  return {
    attempts: 0,
    async createResponse(): Promise<ResponseResult> {
      const failure = failures[this.attempts++];
      if (failure) throw failure;
      return { text: "ok", inputTokens: 1, outputTokens: 1 };
    },
    async uploadFile(): Promise<string> {
      const failure = failures[this.attempts++];
      if (failure) throw failure;
      return "file-1";
    },
  };
}

describe("RetryingMetaApi", () => {
  it("retries rate limits with exponential backoff", async () => {
    const delays: number[] = [];
    const inner = flaky([new MetaApiError(429, "slow down"), new MetaApiError(503, "busy")]);
    const api = new RetryingMetaApi(inner, { sleep: async (ms) => void delays.push(ms) });
    expect((await api.createResponse({})).text).toBe("ok");
    expect(delays).toEqual([2000, 4000]);
  });

  it("does not retry client errors", async () => {
    const inner = flaky([new MetaApiError(400, "bad request")]);
    const api = new RetryingMetaApi(inner, { sleep: async () => undefined });
    await expect(api.createResponse({})).rejects.toMatchObject({ status: 400 });
    expect(inner.attempts).toBe(1);
  });

  it("gives up after the last attempt", async () => {
    const error = new MetaApiError(500, "down");
    const inner = flaky([error, error, error]);
    const api = new RetryingMetaApi(inner, { attempts: 3, sleep: async () => undefined });
    await expect(api.uploadFile(new Uint8Array(), "a", "b")).rejects.toBe(error);
    expect(inner.attempts).toBe(3);
  });

  it("treats timeouts as retryable", () => {
    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    expect(isRetryable(timeout)).toBe(true);
    expect(isRetryable(new Error("other"))).toBe(false);
  });
});
