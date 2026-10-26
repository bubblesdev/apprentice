import { describe, expect, it } from "vitest";
import { Guide } from "./guide.js";
import { applyGuideEdit } from "./guide-edit.js";

const box = { x1: 1, y1: 1, x2: 2, y2: 2, w: 10, h: 10 };
const guide = Guide.parse({
  id: "g",
  title: "Fix sticky buttons",
  status: "approved",
  version: 3,
  source: { id: "s", kind: "video", title: "PS1", location: "ps1.mp4" },
  steps: [
    {
      index: 0,
      title: "Open",
      instruction: "Open it.",
      startS: 0,
      endS: 5,
      doneWhen: "Open.",
      referenceTimesS: [4],
    },
    {
      index: 1,
      title: "Grease",
      instruction: "Grease it.",
      startS: 5,
      endS: 9,
      doneWhen: "Thin film.",
      parts: [{ name: "post", sightings: [{ t: 8, box }] }],
      safety: { level: "caution", note: "Thin layer only." },
    },
    {
      index: 2,
      title: "Close",
      instruction: "Close it.",
      startS: 9,
      endS: 12,
      doneWhen: "Closed.",
    },
  ],
});

const edit = (from: number, title: string, extra: Record<string, string> = {}) => ({
  from,
  title,
  instruction: `${title} now.`,
  doneWhen: `${title} done.`,
  ...extra,
});

describe("applyGuideEdit", () => {
  it("reorders, renames and deletes, keeping each step's frames and parts", () => {
    const result = applyGuideEdit(guide, {
      version: 3,
      title: "Fix PS1 buttons",
      steps: [edit(1, "Grease the post"), edit(0, "Open the shell")],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const g = result.guide;
    expect(g).toMatchObject({ title: "Fix PS1 buttons", version: 4, status: "draft" });
    expect(g.steps.map((s) => [s.index, s.title, s.startS])).toEqual([
      [0, "Grease the post", 5],
      [1, "Open the shell", 0],
    ]);
    expect(g.steps[0]?.parts[0]?.sightings).toHaveLength(1);
    expect(g.steps[0]?.safety).toEqual({ level: "caution", note: "Thin layer only." });
    expect(g.steps[1]?.referenceTimesS).toEqual([4]);
  });

  it("edits, adds and clears safety notes", () => {
    const result = applyGuideEdit(guide, {
      version: 3,
      steps: [
        edit(0, "Open", { safetyNote: "Unplug first." }),
        edit(1, "Grease", { safetyNote: "" }),
      ],
    });
    if (!result.ok) throw new Error(result.message);
    expect(result.guide.steps.map((s) => s.safety)).toEqual([
      { level: "caution", note: "Unplug first." },
      { level: "none" },
    ]);
  });

  it("refuses a stale version, a duplicate or missing step, and a guide still building", () => {
    expect(applyGuideEdit(guide, { version: 2 })).toMatchObject({ ok: false, reason: "stale" });
    expect(
      applyGuideEdit(guide, { version: 3, steps: [edit(0, "a"), edit(0, "b")] }),
    ).toMatchObject({ ok: false, reason: "invalid" });
    expect(applyGuideEdit(guide, { version: 3, steps: [edit(7, "a")] })).toMatchObject({
      ok: false,
      reason: "invalid",
    });
    expect(applyGuideEdit({ ...guide, status: "building" }, { version: 3 })).toMatchObject({
      ok: false,
      reason: "building",
    });
  });

  it("renames only, without touching the steps", () => {
    const result = applyGuideEdit(guide, { version: 3, title: "New name" });
    if (!result.ok) throw new Error(result.message);
    expect(result.guide.steps).toEqual(guide.steps);
  });
});
