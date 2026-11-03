import type { Detection, Media, Segmenter } from "@apprentice/core";
import type { JobFixture } from "./fixtures.js";

export interface FakeSegmenterOptions {
  /** Concepts the fake reports as present; defaults to the concepts SAM tracked in the fixture. */
  concepts?: string[];
  /** Scripted detections for a given image and concept; return undefined to use the default. */
  find?: (image: Media, concept: string) => Detection[] | undefined;
  width?: number;
  height?: number;
}

const GENERIC = new Set(["the", "and", "with", "part", "parts", "tool", "tools"]);

function words(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !GENERIC.has(w));
}

/**
 * Segmenter for development without credits. The fixture holds SAM 3.1 summaries, not per-frame
 * boxes, so this fake answers presence only: a concept is "found" when it shares a word with a
 * concept SAM tracked (e.g. "Phillips screwdriver" matches "screwdriver"), and the box is a
 * synthetic centred one. It never claims to reproduce SAM's real boxes.
 */
export class FakeSegmenter implements Segmenter {
  readonly calls: { operation: "track" | "find"; concept: string }[] = [];
  private readonly known: string[];
  private readonly width: number;
  private readonly height: number;

  constructor(
    fixture: Pick<JobFixture, "samConcepts">,
    private readonly options: FakeSegmenterOptions = {},
  ) {
    this.known = options.concepts ?? Object.keys(fixture.samConcepts);
    this.width = options.width ?? 1280;
    this.height = options.height ?? 720;
  }

  matches(concept: string): boolean {
    const wanted = new Set(words(concept));
    return this.known.some((k) => words(k).some((w) => wanted.has(w)));
  }

  private syntheticBox(): Detection {
    const w = this.width;
    const h = this.height;
    return {
      objectId: 0,
      box: { x1: w * 0.3, y1: h * 0.3, x2: w * 0.7, y2: h * 0.7, w, h },
      confidence: 0.9,
    };
  }

  async trackInVideo(_video: Media, concept: string): Promise<Map<number, Detection[]>> {
    this.calls.push({ operation: "track", concept });
    return this.matches(concept) ? new Map([[0, [this.syntheticBox()]]]) : new Map();
  }

  async findInImage(image: Media, concept: string): Promise<Detection[]> {
    this.calls.push({ operation: "find", concept });
    const scripted = this.options.find?.(image, concept);
    if (scripted) return scripted;
    return this.matches(concept) ? [this.syntheticBox()] : [];
  }
}
