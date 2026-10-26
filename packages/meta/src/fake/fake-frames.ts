import type { FrameExtractor, Media } from "@apprentice/core";
import { fixtureFrame, parseFixtureMedia } from "./fixture-media.js";

/** FrameExtractor that hands out placeholder frames naming the source job and time. */
export class FakeFrameExtractor implements FrameExtractor {
  readonly requested: number[] = [];

  constructor(private readonly job: string) {}

  async frameAt(video: Media, t: number): Promise<Media> {
    this.requested.push(t);
    return fixtureFrame(parseFixtureMedia(video)?.job ?? this.job, Math.round(t * 100) / 100);
  }
}
