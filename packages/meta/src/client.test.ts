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

describe("MetaClient.transcribe", () => {
  it("posts the request settings and the WAV to /asr/transcribe and returns the transcript", async () => {
    const calls: { url: string; form: FormData }[] = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), form: init?.body as FormData });
      return new Response(
        JSON.stringify({ sessionId: "s", transcript: "Which screw first?", turns: [] }),
        { status: 200 },
      );
    }) as typeof fetch;
    const client = new MetaClient({ apiKey: "test", fetch: fetchImpl });
    const r = await client.transcribe({
      model: "muse-voice-transcribe-1.0",
      data: new Uint8Array([1, 2, 3]),
      filename: "q.wav",
      mime: "audio/wav",
    });
    expect(r).toEqual({ text: "Which screw first?" });
    expect(calls[0]?.url).toBe("https://api.meta.ai/v1/asr/transcribe");
    const settings = calls[0]?.form.get("request");
    expect(settings).toBeInstanceOf(Blob);
    expect(JSON.parse(await (settings as Blob).text())).toEqual({
      model: "muse-voice-transcribe-1.0",
      audioEncoding: "WAV",
      mode: "PUSH_TO_TALK",
    });
    expect(calls[0]?.form.get("audio")).toBeInstanceOf(Blob);
  });

  it("treats silence (no transcript) as empty text", async () => {
    const client = new MetaClient({ apiKey: "test", fetch: fakeFetch(200, { turns: [] }) });
    const r = await client.transcribe({
      model: "m",
      data: new Uint8Array([1]),
      filename: "q.wav",
      mime: "audio/wav",
    });
    expect(r).toEqual({ text: "" });
  });
});
