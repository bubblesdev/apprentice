import type { Media } from "@apprentice/core";
import type { JudgeCase } from "./fixtures.js";

/**
 * Fixtures store model outputs, not media. Fake adapters therefore receive placeholder media
 * whose URL names the recorded situation, e.g. `fixture://ps1_buttons/trainee?step=4&case=correct`.
 */
const SCHEME = "fixture:";

export function fixtureSource(job: string): Media {
  return { kind: "url", url: `fixture://${job}/source`, mime: "video/mp4" };
}

export function fixtureFrame(job: string, t: number): Media {
  return { kind: "url", url: `fixture://${job}/frame?t=${t}`, mime: "image/jpeg" };
}

/** A trainee frame from spike 2 run A; `step` is 1-based as in the recording. */
export function fixtureTraineeFrame(job: string, step: number, judgeCase: JudgeCase, i = 0): Media {
  return {
    kind: "url",
    url: `fixture://${job}/trainee?step=${step}&case=${judgeCase}&i=${i}`,
    mime: "image/jpeg",
  };
}

export interface FixtureRef {
  job: string;
  kind: string;
  params: URLSearchParams;
}

export function parseFixtureMedia(media: Media): FixtureRef | undefined {
  if (media.kind !== "url" || !media.url.startsWith(SCHEME)) return undefined;
  const url = new URL(media.url);
  return { job: url.hostname, kind: url.pathname.replace(/^\//, ""), params: url.searchParams };
}
