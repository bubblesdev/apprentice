import type { ClientCoachEvent, ClientMessage, CoachUpdate } from "@apprentice/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, liveSocketUrl, parseServerMessage } from "../../lib/api";

type Frames = Extract<ClientMessage, { type: "frames" }>["frames"];

export interface CoachSession {
  update: CoachUpdate | undefined;
  error: string | undefined;
  /** Sends a coach event; resolves when the server has applied it. */
  send: (event: ClientCoachEvent) => Promise<void>;
  /** Sends one sample of frames; resolves with the resulting update. */
  sendFrames: (frames: Frames) => Promise<CoachUpdate | undefined>;
}

/**
 * The live session: a WebSocket when it connects, plain HTTP otherwise. The server handles one
 * message per session at a time, so replies arrive in order and are matched to requests FIFO.
 */
export function useCoachSession(sessionId: string): CoachSession {
  const [update, setUpdate] = useState<CoachUpdate>();
  const [error, setError] = useState<string>();
  const socket = useRef<WebSocket | null>(null);
  const pending = useRef<((u: CoachUpdate | undefined) => void)[]>([]);

  useEffect(() => {
    let closed = false;
    api
      .session(sessionId)
      .then((u) => !closed && setUpdate(u))
      .catch(
        (e: unknown) =>
          !closed && setError(e instanceof Error ? e.message : "Could not load the session"),
      );

    const ws = new WebSocket(liveSocketUrl(sessionId));
    ws.onopen = () => {
      if (!closed) socket.current = ws;
    };
    ws.onmessage = (event) => {
      const message = parseServerMessage(event.data);
      const resolve = pending.current.shift();
      if (!message) return resolve?.(undefined);
      if (message.type === "update") {
        setUpdate(message.update);
        setError(undefined);
        resolve?.(message.update);
      } else {
        setError(message.message);
        resolve?.(undefined);
      }
    };
    ws.onclose = () => {
      socket.current = null;
      pending.current.splice(0).forEach((r) => r(undefined));
    };
    return () => {
      closed = true;
      ws.close();
    };
  }, [sessionId]);

  const viaSocket = useCallback((message: ClientMessage) => {
    const ws = socket.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return undefined;
    return new Promise<CoachUpdate | undefined>((resolve) => {
      pending.current.push(resolve);
      ws.send(JSON.stringify(message));
    });
  }, []);

  const viaHttp = useCallback(async (call: () => Promise<CoachUpdate>) => {
    try {
      const u = await call();
      setUpdate(u);
      setError(undefined);
      return u;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      return undefined;
    }
  }, []);

  const send = useCallback(
    async (event: ClientCoachEvent) => {
      await (viaSocket({ type: "event", event }) ?? viaHttp(() => api.event(sessionId, event)));
    },
    [sessionId, viaHttp, viaSocket],
  );

  const sendFrames = useCallback(
    (frames: Frames) =>
      viaSocket({ type: "frames", frames }) ?? viaHttp(() => api.frames(sessionId, frames)),
    [sessionId, viaHttp, viaSocket],
  );

  return { update, error, send, sendFrames };
}
