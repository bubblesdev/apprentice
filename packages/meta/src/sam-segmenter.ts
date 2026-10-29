import type { Detection, Media, Segmenter } from "@apprentice/core";
import type { FilesApi, ResponseResult, ResponsesApi } from "./client.js";
import { imagePart, textPart, userTurn, videoPart, type ContentPart } from "./media.js";
import type { CostMeter } from "./meter.js";
import { parseSamImageOutput, parseSamOutput } from "./sam.js";

export const SAM_3_1 = "sam-3.1";

export interface SamSegmenterOptions {
  api: ResponsesApi;
  files?: FilesApi;
  meter?: CostMeter;
  model?: string;
}

/**
 * Segmenter on SAM 3.1 concept prompts. Boxes and confidence are requested; masks come back as
 * one-bit encodings and are left undecoded, because presence and position only need boxes.
 */
export class SamSegmenter implements Segmenter {
  private readonly model: string;

  constructor(private readonly options: SamSegmenterOptions) {
    this.model = options.model ?? SAM_3_1;
  }

  private async call(content: ContentPart[]): Promise<ResponseResult> {
    this.options.meter?.assertWithinBudget();
    return this.options.api.createResponse({
      model: this.model,
      metadata: { mask_encoding: "one_bit", include_confidence: "true" },
      input: userTurn(content),
    });
  }

  /**
   * Tracks one concept through a clip. Run it per step clip, not on a whole long video:
   * spike 1 showed identities fragment over minutes (12 ids for one button).
   */
  async trackInVideo(
    video: Media,
    concept: string,
    opts: { frameCount?: number } = {},
  ): Promise<Map<number, Detection[]>> {
    const result = await this.call([textPart(concept), await videoPart(video, this.options.files)]);
    const frames = parseSamOutput(result.text);
    const estimated = opts.frameCount === undefined;
    const counted = opts.frameCount ?? (frames.size === 0 ? 0 : Math.max(...frames.keys()) + 1);
    this.options.meter?.record(
      "sam_track",
      { unit: "sam_video_frames", frames: counted, estimated },
      result.cached === true,
    );
    return frames;
  }

  async findInImage(image: Media, concept: string): Promise<Detection[]> {
    const result = await this.call([textPart(concept), imagePart(image)]);
    this.options.meter?.record(
      "sam_find",
      { unit: "sam_images", images: 1 },
      result.cached === true,
    );
    return parseSamImageOutput(result.text);
  }
}
