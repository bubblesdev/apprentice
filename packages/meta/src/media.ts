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
 * Videos are sent by file id. Raw bytes are uploaded first; remote URLs must be fetched and
 * uploaded by the ingest stage, because the model cannot be trusted to fetch arbitrary links.
 */
export async function videoPart(media: Media, files?: FilesApi): Promise<ContentPart> {
  switch (media.kind) {
    case "provider_file":
      return { type: "input_video", file_id: media.fileId };
    case "bytes": {
      if (!files) throw new UnsupportedMediaError("Uploading video bytes needs a FilesApi");
      const ext = media.mime.split("/")[1] ?? "bin";
      return {
        type: "input_video",
        file_id: await files.uploadFile(media.data, `video.${ext}`, media.mime),
      };
    }
    case "url":
      throw new UnsupportedMediaError("Video URLs must be downloaded and uploaded before analysis");
  }
}

/** A single user turn, the only shape the adapters send. */
export function userTurn(content: ContentPart[]): Record<string, unknown>[] {
  return [{ role: "user", content }];
}
