import { useCallback, useEffect, useRef, useState } from "react";

export interface Resource<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  reload: () => void;
}

/**
 * Loads data with `load`, re-running when `key` changes. With `pollMs`, it reloads on that interval
 * until `stopWhen(data)` is true. Stale responses (an older key) are ignored.
 */
export function useResource<T>(
  key: string,
  load: () => Promise<T>,
  options: { pollMs?: number; stopWhen?: (data: T) => boolean } = {},
): Resource<T> {
  const [state, setState] = useState<{ key: string; data?: T; error?: Error }>({ key });
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  const optionsRef = useRef(options);
  loadRef.current = load;
  optionsRef.current = options;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      try {
        const data = await loadRef.current();
        if (cancelled) return;
        setState({ key, data });
        const { pollMs, stopWhen } = optionsRef.current;
        if (pollMs && !(stopWhen?.(data) ?? false)) timer = setTimeout(run, pollMs);
      } catch (error) {
        if (!cancelled)
          setState((s) => ({
            key,
            ...(s.key === key && s.data !== undefined ? { data: s.data } : {}),
            error: error instanceof Error ? error : new Error(String(error)),
          }));
      }
    };
    void run();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [key, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const current = state.key === key ? state : { key };
  return {
    data: current.data,
    error: current.error,
    loading: current.data === undefined && !current.error,
    reload,
  };
}
