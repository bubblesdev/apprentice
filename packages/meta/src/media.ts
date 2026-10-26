import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Media } from "@apprentice/core";
import type { FilesApi } from "./client.js";
import { UnsupportedMediaError } from "./errors.js";

/** One item of a Responses `content` array. */
export type ContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string }
  | { type: "input_image"; file_id: string }
  | { type: "input_video"; file_id: string };

export function textPart(text: string): ContentPart {
  return { type: "input_text", text };
}

function toBase64(data: Uint8Array): string {
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("base64");
}

/** Images go inline as data URLs (as in the spikes), by URL, or by uploaded file id. */
export function imagePart(media: Media): ContentPart {
  switch (media.kind) {
    case "bytes":
      return {
        type: "input_image",
        image_url: `data:${media.mime};base64,${toBase64(media.data)}`,
      };
    case "url":
      return { type: "input_image", image_url: media.url };
    case "provider_file":
      return { type: "input_image", file_id: media.fileId };
  }
}

/**
 * Videos are sent by file id. Raw bytes and local `file:` videos are uploaded first (the cache
 * makes that once per distinct video). Remote links must be downloaded by ingest first, because
 * the model cannot be trusted to fetch arbitrary URLs.
 */
export async function videoPart(media: Media, files?: FilesApi): Promise<ContentPart> {
  const upload = async (data: Uint8Array, mime: string): Promise<ContentPart> => {
    if (!files) throw new UnsupportedMediaError("Uploading a video needs a FilesApi");
    const ext = mime.split("/")[1] ?? "bin";
    return { type: "input_video", file_id: await files.uploadFile(data, `video.${ext}`, mime) };
  };
  switch (media.kind) {
    case "provider_file":
      return { type: "input_video", file_id: media.fileId };
    case "bytes":
      return upload(media.data, media.mime);
    case "url":
      if (media.url.startsWith("file:")) {
        return upload(
          new Uint8Array(await readFile(fileURLToPath(media.url))),
          media.mime ?? "video/mp4",
        );
      }
      throw new UnsupportedMediaError("Video URLs must be downloaded and uploaded before analysis");
  }
}

/** A single user turn, the only shape the adapters send. */
export function userTurn(content: ContentPart[]): Record<string, unknown>[] {
  return [{ role: "user", content }];
}
