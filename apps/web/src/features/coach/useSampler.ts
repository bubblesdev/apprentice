import type { CoachUpdate } from "@apprentice/core";
import { useEffect, useRef, type RefObject } from "react";
import { captureFrame, type CapturedFrame } from "./camera";

const FRAME_GAP_MS = 350;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * While the session is verifying, captures `framesPerSample` frames a moment apart, sends them as
 * one sample and waits for the verdict before the next one, at most one sample per
 * `sampleIntervalMs`. Stops as soon as the state leaves verifying. Only checks the trainee asked
 * for are sampled, which keeps a coaching minute cheap.
 */
export function useSampler(
  videoRef: RefObject<HTMLVideoElement | null>,
  update: CoachUpdate | undefined,
  sendFrames: (frames: { mime: "image/jpeg"; data: string }[]) => Promise<CoachUpdate | undefined>,
  onCaptured: (frame: CapturedFrame) => void,
): void {
  const verifying = update?.session.state === "verifying";
  const sampling = update?.sampling;
  const stateRef = useRef(update?.session.state);
  stateRef.current = update?.session.state;

  useEffect(() => {
    if (!verifying || !sampling) return;
    let stopped = false;
    const loop = async () => {
      while (!stopped && stateRef.current === "verifying") {
        const started = Date.now();
        const video = videoRef.current;
        const frames: CapturedFrame[] = [];
        for (let i = 0; i < sampling.framesPerSample && video; i++) {
          if (i > 0) await wait(FRAME_GAP_MS);
          const frame = await captureFrame(video);
          if (frame) frames.push(frame);
        }
        const latest = frames.at(-1);
        if (stopped || !latest) return;
        frames.slice(0, -1).forEach((f) => URL.revokeObjectURL(f.previewUrl));
        onCaptured(latest);
        const result = await sendFrames(frames.map(({ mime, data }) => ({ mime, data })));
        if (!result || result.session.state !== "verifying") return;
        await wait(Math.max(0, sampling.sampleIntervalMs - (Date.now() - started)));
      }
    };
    void loop();
    return () => {
      stopped = true;
    };
  }, [verifying, sampling, videoRef, sendFrames, onCaptured]);
}
