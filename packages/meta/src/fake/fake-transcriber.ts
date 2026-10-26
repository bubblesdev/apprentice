import type { Transcriber } from "@apprentice/core";

/** No speech was recorded in the spikes, so the fake hears nothing; typed questions still work. */
export class FakeTranscriber implements Transcriber {
  async transcribe(): Promise<{ text: string }> {
    return { text: "" };
  }
}
