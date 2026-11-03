import { useEffect, useState, type RefObject } from "react";

export type CameraStatus = "starting" | "live" | "denied" | "unavailable";

/** Starts the rear camera into `videoRef` and stops every track on unmount. */
export function useCamera(videoRef: RefObject<HTMLVideoElement | null>): CameraStatus {
  const [status, setStatus] = useState<CameraStatus>("starting");

  useEffect(() => {
    let stream: MediaStream | undefined;
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("unavailable");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })
      .then(async (s) => {
        stream = s;
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = s;
        await video.play().catch(() => undefined);
        setStatus("live");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const name = error instanceof DOMException ? error.name : "";
        setStatus(
          name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable",
        );
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [videoRef]);

  return status;
}

export interface CapturedFrame {
  mime: "image/jpeg";
  /** Base64 JPEG, as the API expects. */
  data: string;
  /** Object URL for showing "you" next to the expert; revoke when replaced. */
  previewUrl: string;
}

/** Grabs the current video frame as a small JPEG (640 px wide), enough for the judge and cheap to send. */
export async function captureFrame(
  video: HTMLVideoElement,
  maxWidth = 640,
  quality = 0.72,
): Promise<CapturedFrame | undefined> {
  if (!video.videoWidth || !video.videoHeight) return undefined;
  const scale = Math.min(1, maxWidth / video.videoWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!blob) return undefined;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { mime: "image/jpeg", data: btoa(binary), previewUrl: URL.createObjectURL(blob) };
}
