import type { BuildStatus, Guide } from "@apprentice/core";
import { describe, expect, it } from "vitest";
import { buildPhase, buildRows } from "./buildView";

const status = (stages: BuildStatus["stages"], error?: string): BuildStatus => ({
  guideId: "g",
  stages,
  updatedAt: "2026-10-27T10:00:00.000Z",
  ...(error ? { error } : {}),
});

describe("buildRows", () => {
  it("marks finished stages done and the next one active", () => {
    const rows = buildRows(
      status([{ stage: "draft_steps", state: "done", detail: "10 steps found" }]),
      "building",
      false,
    );
    expect(rows.map((r) => r.state)).toEqual(["done", "active", "pending", "pending", "pending"]);
    expect(rows[0]?.detail).toBe("10 steps found");
    expect(rows.map((r) => r.model)).toEqual([
      "Muse Spark",
      "Muse Spark",
      "",
      "SAM 3.1",
      "Muse Image",
    ]);
  });

  it("starts with the first stage active before any progress arrives", () => {
    expect(buildRows(undefined, "building", false)[0]?.state).toBe("active");
  });

  it("shows skipped stages for documents and reads instead of watching", () => {
    const rows = buildRows(
      status([
        { stage: "draft_steps", state: "done" },
        { stage: "refine_boundaries", state: "skipped" },
      ]),
      "building",
      true,
    );
    expect(rows[0]?.label).toBe("Reading the instructions");
    expect(rows.map((r) => r.state)).toEqual(["done", "skipped", "active", "pending", "pending"]);
  });

  it("has no active stage once ready or failed", () => {
    expect(buildRows(undefined, "ready", false).every((r) => r.state === "done")).toBe(true);
    expect(buildRows(undefined, "failed", false).some((r) => r.state === "active")).toBe(false);
  });
});

describe("buildPhase", () => {
  it("is ready once the guide leaves building, failed when the build reports an error", () => {
    const guide = { status: "draft" } as Guide;
    expect(buildPhase(guide, undefined)).toBe("ready");
    expect(buildPhase({ status: "building" } as Guide, status([], "Budget used"))).toBe("failed");
    expect(buildPhase(undefined, undefined)).toBe("building");
  });
});
