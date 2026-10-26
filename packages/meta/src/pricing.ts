import type { Usage } from "@apprentice/core";

/**
 * Meta Model API prices in US dollars (dev.meta.ai/docs/pricing-rate-limits, read 26 Oct 2026).
 * Used to meter every call against a guide or session budget.
 */
export const TOKEN_PRICES: Record<string, { input: number; output: number }> = {
  "muse-spark-1.3": { input: 1.25, output: 4.25 },
  "muse-spark-1.2": { input: 1.25, output: 4.25 },
  "muse-wonder-1.0": { input: 4, output: 20 },
};

export const IMAGE_PRICE_PER_IMAGE: Record<string, number> = { "muse-image-1.0": 0.01 };
export const SAM_IMAGE_PRICE = 2.5 / 1000;
export const SAM_VIDEO_PRICE_PER_FRAME = 0.2 / 1000;
export const SAM_VIDEO_MIN_FRAMES = 50;
export const TRANSCRIBE_PRICE_PER_SECOND = 0.18 / 3600;

export function tokenCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = TOKEN_PRICES[model];
  if (!p) throw new Error(`No price for model ${model}`);
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

export function samVideoCost(frames: number): number {
  return Math.max(frames, SAM_VIDEO_MIN_FRAMES) * SAM_VIDEO_PRICE_PER_FRAME;
}

/** Dollar cost of one call's billable units. Throws for a token model with no known price. */
export function usageCost(usage: Usage): number {
  switch (usage.unit) {
    case "tokens":
      return tokenCost(usage.model, usage.inputTokens, usage.outputTokens);
    case "sam_images":
      return usage.images * SAM_IMAGE_PRICE;
    case "sam_video_frames":
      return samVideoCost(usage.frames);
    case "images": {
      const price = IMAGE_PRICE_PER_IMAGE[usage.model];
      if (price === undefined) throw new Error(`No price for model ${usage.model}`);
      return usage.images * price;
    }
    case "audio_seconds":
      return usage.seconds * TRANSCRIBE_PRICE_PER_SECOND;
  }
}
