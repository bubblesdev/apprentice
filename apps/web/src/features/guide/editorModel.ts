import type { Guide, GuideEditRequest } from "@apprentice/core";

export interface DraftStep {
  /** Index of the step in the guide version being edited. */
  from: number;
  title: string;
  instruction: string;
  doneWhen: string;
  safetyNote: string;
}

export interface EditorDraft {
  version: number;
  title: string;
  steps: DraftStep[];
}

export type EditorAction =
  | { type: "title"; value: string }
  | {
      type: "field";
      at: number;
      field: "title" | "instruction" | "doneWhen" | "safetyNote";
      value: string;
    }
  | { type: "move"; at: number; by: -1 | 1 }
  | { type: "remove"; at: number };

export function draftFrom(guide: Guide): EditorDraft {
  return {
    version: guide.version,
    title: guide.title,
    steps: guide.steps.map((s, i) => ({
      from: i,
      title: s.title,
      instruction: s.instruction,
      doneWhen: s.doneWhen,
      safetyNote: s.safety.note ?? "",
    })),
  };
}

export function editorReducer(draft: EditorDraft, action: EditorAction): EditorDraft {
  switch (action.type) {
    case "title":
      return { ...draft, title: action.value };
    case "field":
      return {
        ...draft,
        steps: draft.steps.map((s, i) =>
          i === action.at ? { ...s, [action.field]: action.value } : s,
        ),
      };
    case "move": {
      const to = action.at + action.by;
      const moving = draft.steps[action.at];
      if (!moving || to < 0 || to >= draft.steps.length) return draft;
      const steps = draft.steps.filter((_, i) => i !== action.at);
      steps.splice(to, 0, moving);
      return { ...draft, steps };
    }
    case "remove":
      return draft.steps.length <= 1
        ? draft
        : { ...draft, steps: draft.steps.filter((_, i) => i !== action.at) };
  }
}

/** Problems that would make the server refuse the edit, shown before saving. */
export function draftErrors(draft: EditorDraft): string[] {
  const errors: string[] = [];
  if (!draft.title.trim()) errors.push("The guide needs a name.");
  draft.steps.forEach((s, i) => {
    if (!s.title.trim() || !s.instruction.trim() || !s.doneWhen.trim()) {
      errors.push(`Step ${i + 1} needs a title, an instruction and a "done when".`);
    }
  });
  return errors;
}

export function toRequest(draft: EditorDraft, original: Guide): GuideEditRequest {
  return {
    version: draft.version,
    title: draft.title.trim(),
    steps: draft.steps.map((s) => {
      const before = original.steps[s.from]?.safety.note ?? "";
      return {
        from: s.from,
        title: s.title.trim(),
        instruction: s.instruction.trim(),
        doneWhen: s.doneWhen.trim(),
        ...(s.safetyNote.trim() !== before ? { safetyNote: s.safetyNote.trim() } : {}),
      };
    }),
  };
}
