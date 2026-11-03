import type { Illustrator, Media } from "@apprentice/core";
import type { ResponseImage, ResponsesApi } from "./client.js";
import { ModelOutputError } from "./errors.js";
import { imagePart, textPart, userTurn, type ContentPart } from "./media.js";
import type { CostMeter } from "./meter.js";
import { diagramPrompt } from "./prompts.js";

export const MUSE_IMAGE = "muse-image-1.0";

export interface MuseIllustratorOptions {
  api: ResponsesApi;
  meter?: CostMeter;
  model?: string;
  /** Fetches an image returned by URL; injected for tests. */
  fetch?: typeof fetch;
}

/** Illustrator on Muse Image: a labelled line diagram per step, from the expert's finished frame. */
export class MuseIllustrator implements Illustrator {
  private readonly model: string;

  constructor(private readonly options: MuseIllustratorOptions) {
    this.model = options.model ?? MUSE_IMAGE;
  }

  private async bytes(
    image: ResponseImage,
  ): Promise<{ kind: "bytes"; mime: string; data: Uint8Array }> {
    if (image.base64) {
      return {
        kind: "bytes",
        mime: image.mime ?? "image/png",
        data: new Uint8Array(Buffer.from(image.base64, "base64")),
      };
    }
    if (image.url?.startsWith("https://")) {
      const res = await (this.options.fetch ?? fetch)(image.url);
      if (!res.ok)
        throw new ModelOutputError(
          `Could not download the diagram (HTTP ${res.status})`,
          image.url,
        );
      const mime = res.headers.get("content-type")?.split(";")[0] ?? image.mime ?? "image/png";
      return { kind: "bytes", mime, data: new Uint8Array(await res.arrayBuffer()) };
    }
    throw new ModelOutputError("Muse Image returned no usable image", JSON.stringify(image));
  }

  async diagram(input: {
    title: string;
    instruction: string;
    parts: string[];
    reference: Media[];
  }) {
    this.options.meter?.assertWithinBudget();
    const content: ContentPart[] = [
      textPart(diagramPrompt(input, input.reference.length > 0)),
      ...input.reference.slice(-1).map(imagePart),
    ];
    const result = await this.options.api.createResponse({
      model: this.model,
      input: userTurn(content),
    });
    const image = result.images?.[0];
    this.options.meter?.record(
      "draw_diagram",
      { unit: "images", model: this.model, images: image ? 1 : 0 },
      result.cached === true,
    );
    if (!image) throw new ModelOutputError("Muse Image returned no image", result.text);
    return this.bytes(image);
  }
}
