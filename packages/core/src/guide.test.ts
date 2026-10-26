import { describe, expect, it } from "vitest";
import { Step } from "./guide.js";

const base = {
  index: 0,
  title: "Remove the Power cap",
  instruction: "Press the clips and push the cap out.",
  startS: 48,
  endS: 68,
  doneWhen: "Cap out, socket empty.",
};

describe("Step", () => {
  it("fills defaults for parts, references and safety", () => {
    const step = Step.parse(base);
    expect(step.parts).toEqual([]);
    expect(step.referenceTimesS).toEqual([]);
    expect(step.safety).toEqual({ level: "none" });
  });

  it("rejects a step that ends before it starts", () => {
    expect(Step.safeParse({ ...base, endS: 10 }).success).toBe(false);
  });
});
