import { Guide } from "@apprentice/core";
import { describe, expect, it } from "vitest";
import { draftErrors, draftFrom, editorReducer, toRequest } from "./editorModel";

const guide = Guide.parse({
  id: "g",
  title: "Fix it",
  status: "draft",
  version: 2,
  source: { id: "s", kind: "video", title: "v", location: "v.mp4" },
  steps: ["A", "B", "C"].map((t, index) => ({
    index,
    title: t,
    instruction: `${t} it.`,
    startS: index,
    endS: index + 1,
    doneWhen: `${t} done.`,
    ...(t === "B" ? { safety: { level: "caution", note: "Careful." } } : {}),
  })),
});

describe("editorReducer", () => {
  it("moves steps within bounds and keeps their origin", () => {
    let d = draftFrom(guide);
    d = editorReducer(d, { type: "move", at: 2, by: -1 });
    expect(d.steps.map((s) => s.from)).toEqual([0, 2, 1]);
    expect(editorReducer(d, { type: "move", at: 0, by: -1 })).toBe(d);
    expect(editorReducer(d, { type: "move", at: 2, by: 1 })).toBe(d);
  });

  it("removes steps but never the last one", () => {
    let d = draftFrom(guide);
    d = editorReducer(editorReducer(d, { type: "remove", at: 0 }), { type: "remove", at: 0 });
    expect(d.steps.map((s) => s.from)).toEqual([2]);
    expect(editorReducer(d, { type: "remove", at: 0 })).toBe(d);
  });

  it("edits fields and reports what is missing", () => {
    const d = editorReducer(draftFrom(guide), {
      type: "field",
      at: 1,
      field: "doneWhen",
      value: " ",
    });
    expect(draftErrors(d)).toEqual(['Step 2 needs a title, an instruction and a "done when".']);
    expect(draftErrors(editorReducer(d, { type: "title", value: "" }))).toHaveLength(2);
  });
});

describe("toRequest", () => {
  it("sends the new order and only changed safety notes", () => {
    let d = draftFrom(guide);
    d = editorReducer(d, { type: "field", at: 0, field: "safetyNote", value: "Unplug first." });
    d = editorReducer(d, { type: "field", at: 1, field: "title", value: "  B2 " });
    const req = toRequest(d, guide);
    expect(req.version).toBe(2);
    expect(req.steps?.map((s) => [s.from, s.title, s.safetyNote])).toEqual([
      [0, "A", "Unplug first."],
      [1, "B2", undefined],
      [2, "C", undefined],
    ]);
  });
});
