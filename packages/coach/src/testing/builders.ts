import { Guide, type Clock, type VerdictKind } from "@apprentice/core";
import type { PartCheck, Sample } from "../sample.js";

/** A clock that moves forward one second per reading. */
export function tickingClock(start = "2026-10-27T10:00:00Z"): Clock {
  let t = Date.parse(start);
  return {
    now: () => {
      const d = new Date(t);
      t += 1000;
      return d;
    },
  };
}

export function sample(
  kind: VerdictKind,
  confidence: number,
  opts: { parts?: PartCheck[]; frameKeys?: string[]; error?: Sample["error"] } = {},
): Sample {
  return {
    judgement: { kind, confidence, sentence: `${kind} at ${confidence}` },
    parts: opts.parts ?? [],
    frameKeys: opts.frameKeys ?? [],
    ...(opts.error ? { error: opts.error } : {}),
  };
}

const box = { x1: 1, y1: 1, x2: 10, y2: 10, w: 100, h: 100 };

/** A three-step guide; step 2 is a "stop" safety step and step 1 has a grounded part. */
export function smallGuide(): Guide {
  return Guide.parse({
    id: "g1",
    title: "Test guide",
    status: "approved",
    version: 1,
    source: { id: "s1", kind: "video", title: "Test", location: "test.mp4" },
    steps: [
      {
        index: 0,
        title: "Remove the cap",
        instruction: "Push the cap out.",
        startS: 0,
        endS: 10,
        doneWhen: "Cap out.",
        parts: [{ name: "Power cap", sightings: [{ t: 9, box }] }, { name: "spring" }],
      },
      {
        index: 1,
        title: "Unplug the iron",
        instruction: "Unplug it and let it cool.",
        startS: 10,
        endS: 20,
        doneWhen: "Plug out of the socket.",
        safety: { level: "stop", note: "Hot and live." },
      },
      {
        index: 2,
        title: "Test",
        instruction: "Press it.",
        startS: 20,
        endS: 30,
        doneWhen: "Returns crisply.",
      },
    ],
  });
}
