/** 68 -> "1:08"; used for step times in the source video. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** 702 -> "11 min 42 s", 40 -> "40 s". */
export function duration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return m === 0 ? `${s} s` : `${m} min ${s % 60} s`;
}

/** "about 8 min" for a guide built from a 7:43 video. */
export function aboutMinutes(seconds: number): string {
  return `about ${Math.max(1, Math.round(seconds / 60))} min`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Unique part names across steps, in first-seen order. */
export function uniqueParts(
  steps: readonly { parts: readonly { name: string }[] }[],
  limit = 3,
): string[] {
  const seen = new Set<string>();
  for (const step of steps) for (const p of step.parts) seen.add(p.name);
  return [...seen].slice(0, limit);
}
