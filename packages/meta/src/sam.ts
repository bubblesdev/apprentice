import type { Box, Detection } from "@apprentice/core";

/**
 * Parses SAM 3.1 text output (dev.meta.ai/docs/sam/reading-segmentation).
 *
 * Each line is one frame: `<Nf>` then comma-separated records of
 * `<objectId><|box;x1=..;y1=..;x2=..;y2=..;w=..;h=..[;c=..]|><|mask;...|>`.
 * Frames may skip or arrive out of order, so results are keyed by frame index.
 * Masks are not decoded here; boxes are enough for presence and position checks.
 */
const FRAME = /^<(\d+)f>(.*)$/;
const RECORD = /(\d+)<\|box;([^|]*)\|>/g;

function parseFields(fields: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const pair of fields.split(";")) {
    const eq = pair.indexOf("=");
    if (eq > 0) out[pair.slice(0, eq)] = Number(pair.slice(eq + 1));
  }
  return out;
}

function toBox(f: Record<string, number>): Box | null {
  const { x1, y1, x2, y2, w, h } = f;
  if ([x1, y1, x2, y2, w, h].some((v) => v === undefined || Number.isNaN(v))) return null;
  return {
    x1: x1 as number,
    y1: y1 as number,
    x2: x2 as number,
    y2: y2 as number,
    w: w as number,
    h: h as number,
  };
}

export function parseSamOutput(text: string): Map<number, Detection[]> {
  const frames = new Map<number, Detection[]>();
  for (const raw of text.split("\n")) {
    const line = FRAME.exec(raw.trim());
    if (!line) continue;
    const detections: Detection[] = [];
    for (const rec of (line[2] ?? "").matchAll(RECORD)) {
      const fields = parseFields(rec[2] ?? "");
      const box = toBox(fields);
      if (!box) continue;
      detections.push({
        objectId: Number(rec[1]),
        box,
        ...(fields.c === undefined ? {} : { confidence: fields.c }),
      });
    }
    frames.set(Number(line[1]), detections);
  }
  return frames;
}
