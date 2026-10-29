import { RecordingLabels, type Guide, type StepOutcome } from "@apprentice/core";

export interface StepMark {
  endS: number;
  outcome: StepOutcome;
  note: string;
}

export interface LabDraft {
  guideId: string;
  guideVersion: number;
  marks: Partial<Record<number, StepMark>>;
}

export type LabAction =
  | { type: "mark"; stepIndex: number; endS: number; outcome: StepOutcome }
  | { type: "note"; stepIndex: number; value: string }
  | { type: "clear"; stepIndex: number }
  | { type: "reset" };

export const emptyDraft = (guide: Pick<Guide, "id" | "version">): LabDraft => ({
  guideId: guide.id,
  guideVersion: guide.version,
  marks: {},
});

const round = (t: number) => Math.round(t * 10) / 10;

export function labReducer(draft: LabDraft, action: LabAction): LabDraft {
  switch (action.type) {
    case "mark": {
      const note = draft.marks[action.stepIndex]?.note ?? "";
      return {
        ...draft,
        marks: {
          ...draft.marks,
          [action.stepIndex]: { endS: round(action.endS), outcome: action.outcome, note },
        },
      };
    }
    case "note": {
      const mark = draft.marks[action.stepIndex];
      if (!mark) return draft;
      return {
        ...draft,
        marks: { ...draft.marks, [action.stepIndex]: { ...mark, note: action.value } },
      };
    }
    case "clear": {
      const marks = Object.fromEntries(
        Object.entries(draft.marks).filter(([k]) => Number(k) !== action.stepIndex),
      );
      return { ...draft, marks };
    }
    case "reset":
      return { ...draft, marks: {} };
  }
}

/** The first step without a mark: where the labeller is. */
export function currentStep(
  guide: { steps: readonly unknown[] },
  draft: LabDraft,
): number | undefined {
  const i = guide.steps.findIndex((_, k) => !draft.marks[k]);
  return i === -1 ? undefined : i;
}

/** Problems worth a look before exporting; none of them block it. */
export function labWarnings(
  guide: { steps: readonly unknown[] },
  draft: LabDraft,
  durationS?: number,
): string[] {
  const warnings: string[] = [];
  let last: { k: number; endS: number } | undefined;
  guide.steps.forEach((_, k) => {
    const m = draft.marks[k];
    if (!m) return;
    if (last && m.endS < last.endS)
      warnings.push(`Step ${k + 1} is marked before step ${last.k + 1} ends.`);
    if (durationS !== undefined && m.endS > durationS + 0.5)
      warnings.push(`Step ${k + 1} is marked after the end of the video.`);
    last = { k, endS: m.endS };
  });
  const unmarked = guide.steps.length - Object.keys(draft.marks).length;
  if (unmarked > 0 && Object.keys(draft.marks).length > 0)
    warnings.push(
      unmarked === 1
        ? "1 step has no mark and will be left out."
        : `${unmarked} steps have no mark and will be left out.`,
    );
  return warnings;
}

/** The file `apprentice-eval set from-labels` reads. Throws when nothing is marked. */
export function toRecordingLabels(
  draft: LabDraft,
  video: { name: string; durationS: number },
  description?: string,
): RecordingLabels {
  const steps = Object.entries(draft.marks).flatMap(([k, m]) =>
    m
      ? [
          {
            stepIndex: Number(k),
            endS: m.endS,
            outcome: m.outcome,
            ...(m.note.trim() ? { note: m.note.trim() } : {}),
          },
        ]
      : [],
  );
  return RecordingLabels.parse({
    version: 1,
    guideId: draft.guideId,
    guideVersion: draft.guideVersion,
    video: { name: video.name, durationS: round(Math.max(video.durationS, 0.1)) },
    ...(description?.trim() ? { description: description.trim() } : {}),
    steps: steps.sort((a, b) => a.stepIndex - b.stepIndex),
  });
}

export const labelsFileName = (videoName: string) =>
  `${videoName.replace(/\.[a-z0-9]+$/i, "") || "recording"}.labels.json`;

/** m:ss.s for the step list. */
export function clock(t: number): string {
  const m = Math.floor(t / 60);
  const s = (t - m * 60).toFixed(1).padStart(4, "0");
  return `${m}:${s}`;
}
