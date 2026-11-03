import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import { recordingToWav, toBase64 } from "../../lib/wav";

export type QuestionState =
  | { kind: "idle" }
  | { kind: "recording" }
  | { kind: "thinking"; question?: string }
  | { kind: "answered"; question: string; answer: string }
  | { kind: "error"; message: string };

const MAX_RECORDING_MS = 30_000;

/** Records a spoken question (or takes a typed one) and asks the coach about the current step. */
export function useQuestion(sessionId: string, onAnswer: (answer: string) => void) {
  const [state, setState] = useState<QuestionState>({ kind: "idle" });
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const send = useCallback(
    async (body: Parameters<typeof api.ask>[1], typed?: string) => {
      setState(typed ? { kind: "thinking", question: typed } : { kind: "thinking" });
      try {
        const { question, answer } = await api.ask(sessionId, body);
        setState({ kind: "answered", question, answer });
        onAnswer(answer);
      } catch (e) {
        setState({
          kind: "error",
          message: e instanceof Error ? e.message : "Something went wrong",
        });
      }
    },
    [sessionId, onAnswer],
  );

  const stop = useCallback(() => {
    clearTimeout(timer.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setState({
        kind: "error",
        message: "This browser can't record audio. Type your question instead.",
      });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        try {
          const wav = await recordingToWav(new Blob(chunks, { type: rec.mimeType }));
          await send({ audio: { mime: "audio/wav", data: toBase64(wav) } });
        } catch {
          setState({
            kind: "error",
            message: "I couldn't read that recording. Try again, or type it.",
          });
        }
      };
      recorder.current = rec;
      rec.start();
      setState({ kind: "recording" });
      timer.current = setTimeout(stop, MAX_RECORDING_MS);
    } catch {
      setState({ kind: "error", message: "Microphone access is off. Type your question instead." });
    }
  }, [send, stop]);

  useEffect(() => () => stop(), [stop]);

  const askText = useCallback((text: string) => send({ text }, text), [send]);
  const reset = useCallback(() => setState({ kind: "idle" }), []);

  return { state, start, stop, askText, reset };
}
