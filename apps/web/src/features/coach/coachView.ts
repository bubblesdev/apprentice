import type { CoachUpdate, Step } from "@apprentice/core";

export type Tone = "accent" | "amber" | "coral";

export type CoachPanel =
  | { kind: "briefing"; warning?: string }
  | { kind: "doing"; note?: { title: string; sentence: string } }
  | { kind: "verifying"; detail: string }
  | { kind: "pass"; sentence: string; last: boolean }
  | { kind: "closer"; title: string; sentence: string; canOverride: boolean }
  | { kind: "retry"; title: string; sentence: string }
  | { kind: "stop"; title: string; sentence: string }
  | { kind: "complete" };

export interface CoachView {
  stepNumber: number;
  total: number;
  /** 0 to 1, counting the current step once it passes. */
  progress: number;
  tone: Tone;
  panel: CoachPanel;
  /** What the coach says aloud on entering this view, if anything. */
  spoken?: string;
}

/** Joins sentences for speech, adding a full stop only where one is missing. */
export function sentences(...parts: (string | undefined)[]): string {
  return parts
    .map((p) => p?.trim())
    .filter((p): p is string => Boolean(p))
    .map((p) => (/[.!?]$/.test(p) ? p : `${p}.`))
    .join(" ");
}

function list(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? ""}`;
}

function closerTitle(
  reason: string | undefined,
  missing: readonly string[],
  showMe: string | undefined,
): string {
  if (reason === "parts_missing" && missing[0]) return `Show me the ${missing[0]}`;
  if ((reason === "unclear" || reason === "low_confidence") && showMe) return showMe;
  if (reason === "model_error") return "I couldn't check that";
  if (reason === "unavailable") return "Checking is paused";
  return "Show me closer";
}

/** Turns the server's coach state into what the coach screen shows and says. Pure. */
export function coachView(update: CoachUpdate, steps: readonly Step[]): CoachView {
  const { session, decision } = update;
  const step = steps[session.stepIndex];
  const total = steps.length;
  const base = {
    stepNumber: session.stepIndex + 1,
    total,
    progress: session.stepIndex / Math.max(1, total),
  };
  const sentence = decision?.sentence ?? "";

  switch (session.state) {
    case "briefing": {
      const warning = step?.safety.level !== "none" ? step?.safety.note : undefined;
      return {
        ...base,
        tone: step?.safety.level === "stop" ? "coral" : "accent",
        panel: warning ? { kind: "briefing", warning } : { kind: "briefing" },
        spoken: sentences(step?.instruction, warning),
      };
    }
    case "doing":
      return decision?.kind === "not_yet"
        ? {
            ...base,
            tone: "amber",
            panel: { kind: "doing", note: { title: "Not finished yet", sentence } },
            spoken: sentences("Not finished yet", sentence),
          }
        : {
            ...base,
            tone: "accent",
            panel: { kind: "doing" },
            ...(step ? { spoken: step.instruction } : {}),
          };
    case "verifying": {
      const parts = step?.parts.filter((p) => p.sightings.length > 0).map((p) => p.name) ?? [];
      const detail = parts.length
        ? `Looking at the ${list(parts.slice(0, 2))}`
        : "Comparing with the expert's finished step";
      return { ...base, tone: "accent", panel: { kind: "verifying", detail } };
    }
    case "passed":
      return {
        ...base,
        progress: (session.stepIndex + 1) / Math.max(1, total),
        tone: "accent",
        panel: { kind: "pass", sentence, last: session.stepIndex + 1 >= total },
        spoken: "Looks right.",
      };
    case "closer": {
      const title = closerTitle(decision?.reason, decision?.missingParts ?? [], step?.showMe);
      const text =
        decision?.reason === "unavailable"
          ? "The check budget for this session is used. You can confirm steps yourself."
          : sentence;
      return {
        ...base,
        tone: "amber",
        panel: { kind: "closer", title, sentence: text, canOverride: update.canOverride },
        spoken: title,
      };
    }
    case "retry": {
      const title = decision?.reason === "skipped" ? "A step looks skipped" : "Not quite right";
      return {
        ...base,
        tone: "coral",
        panel: { kind: "retry", title, sentence },
        spoken: sentences(title, sentence),
      };
    }
    case "blocked":
      return {
        ...base,
        tone: "coral",
        panel: { kind: "stop", title: "Stop: this looks unsafe", sentence },
        spoken: sentences("Stop", sentence),
      };
    case "complete":
      return { ...base, progress: 1, tone: "accent", panel: { kind: "complete" } };
  }
}
