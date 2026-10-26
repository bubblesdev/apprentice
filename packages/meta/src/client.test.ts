import { describe, expect, it } from "vitest";
import { MetaApiError, MetaClient } from "./client.js";

function fakeFetch(status: number, body: unknown): typeof fetch {
  return (async () =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
    })) as typeof fetch;
}

describe("MetaClient.createResponse", () => {
  it("joins output text and reports token usage", async () => {
    const client = new MetaClient({
      apiKey: "test",
      fetch: fakeFetch(200, {
        output: [{ content: [{ type: "output_text", text: '{"verdict":"done"}' }] }],
        usage: { input_tokens: 1200, output_tokens: 80 },
      }),
    });
    const r = await client.createResponse({ model: "muse-spark-1.3", input: [] });
    expect(r).toEqual({ text: '{"verdict":"done"}', inputTokens: 1200, outputTokens: 80 });
  });

  it("throws MetaApiError on HTTP errors", async () => {
    const client = new MetaClient({ apiKey: "test", fetch: fakeFetch(429, "rate limited") });
    await expect(client.createResponse({ model: "x", input: [] })).rejects.toBeInstanceOf(
      MetaApiError,
    );
  });

  it("refuses to start without a key", () => {
    expect(() => new MetaClient({ apiKey: "" })).toThrow();
  });
});
