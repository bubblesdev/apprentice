import type { FilesApi, ResponseResult, ResponsesApi } from "../client.js";

/** Test double for the Meta API: replies in order and records every request body. */
export class StubMetaApi implements ResponsesApi, FilesApi {
  readonly bodies: Record<string, unknown>[] = [];
  readonly uploads: { filename: string; mime: string; bytes: number }[] = [];

  constructor(private readonly replies: (Partial<ResponseResult> & { text: string })[]) {}

  async createResponse(body: Record<string, unknown>): Promise<ResponseResult> {
    this.bodies.push(body);
    const reply = this.replies[Math.min(this.bodies.length - 1, this.replies.length - 1)];
    if (!reply) throw new Error("StubMetaApi has no replies");
    return { inputTokens: 1000, outputTokens: 100, ...reply };
  }

  async uploadFile(data: Uint8Array, filename: string, mime: string): Promise<string> {
    this.uploads.push({ filename, mime, bytes: data.byteLength });
    return `file-${this.uploads.length}`;
  }
}
