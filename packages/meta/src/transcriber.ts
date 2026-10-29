import type { Media, Transcriber } from "@apprentice/core";
import type { TranscribeApi } from "./client.js";
import { UnsupportedMediaError } from "./errors.js";
import type { CostMeter } from "./meter.js";

export const VOICE_TRANSCRIBE = "muse-voice-transcribe-1.0";

/** Duration in seconds of a PCM WAV file, from its header; undefined if it is not one. */
export function wavDurationS(data: Uint8Array): number | undefined {
  if (data.byteLength < 44) return undefined;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const tag = (at: number) => String.fromCharCode(...data.subarray(at, at + 4));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return undefined;
  let byteRate = 0;
  for (let at = 12; at + 8 <= data.byteLength;) {
    const id = tag(at);
    const size = view.getUint32(at + 4, true);
    if (id === "fmt ") byteRate = view.getUint32(at + 16, true);
    if (id === "data")
      return byteRate > 0 ? Math.min(size, data.byteLength - at - 8) / byteRate : undefined;
    at += 8 + size + (size % 2);
  }
  return undefined;
}

export interface MuseTranscriberOptions {
  api: TranscribeApi;
  meter?: CostMeter;
  model?: string;
}

/**
 * Transcriber on Muse Voice Transcribe: mono 16-bit PCM WAV at 16 or 24 kHz, up to 10 minutes
 * (the browser records and encodes it so). Billed per second of audio.
 */
export class MuseTranscriber implements Transcriber {
  private readonly model: string;

  constructor(private readonly options: MuseTranscriberOptions) {
    this.model = options.model ?? VOICE_TRANSCRIBE;
  }

  async transcribe(audio: Media): Promise<{ text: string }> {
    if (audio.kind !== "bytes")
      throw new UnsupportedMediaError("Transcription needs the audio bytes");
    const seconds = wavDurationS(audio.data);
    if (seconds === undefined) throw new UnsupportedMediaError("Audio must be a PCM WAV file");
    this.options.meter?.assertWithinBudget();
    const result = await this.options.api.transcribe({
      model: this.model,
      data: audio.data,
      filename: "question.wav",
      mime: "audio/wav",
    });
    this.options.meter?.record(
      "transcribe",
      { unit: "audio_seconds", seconds },
      result.cached === true,
    );
    return { text: result.text.trim() };
  }
}
