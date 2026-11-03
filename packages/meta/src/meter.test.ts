import { describe, expect, it } from "vitest";
import { BudgetExceededError } from "./errors.js";
import { CostMeter } from "./meter.js";
import { usageCost } from "./pricing.js";

const clock = { now: () => new Date("2026-10-27T10:00:00Z") };
const scope = { kind: "guide", id: "g1" } as const;

describe("usageCost", () => {
  it("prices each billable unit", () => {
    expect(
      usageCost({
        unit: "tokens",
        model: "muse-spark-1.3",
        inputTokens: 1_000_000,
        outputTokens: 0,
      }),
    ).toBe(1.25);
    expect(usageCost({ unit: "sam_images", images: 4 })).toBeCloseTo(0.01);
    expect(usageCost({ unit: "sam_video_frames", frames: 10, estimated: false })).toBeCloseTo(0.01);
    expect(usageCost({ unit: "images", model: "muse-image-1.0", images: 3 })).toBeCloseTo(0.03);
    expect(usageCost({ unit: "audio_seconds", seconds: 3600 })).toBeCloseTo(0.18);
  });

  it("refuses to guess a price for an unknown model", () => {
    expect(() =>
      usageCost({ unit: "tokens", model: "mystery", inputTokens: 1, outputTokens: 1 }),
    ).toThrow();
  });
});

describe("CostMeter", () => {
  it("records events with cost, and cache hits at zero cost", () => {
    const seen: string[] = [];
    const meter = new CostMeter({ scope, clock, onEvent: (e) => seen.push(e.operation) });
    meter.record(
      "judge_step",
      { unit: "tokens", model: "muse-spark-1.3", inputTokens: 2000, outputTokens: 200 },
      false,
    );
    meter.record(
      "judge_step",
      { unit: "tokens", model: "muse-spark-1.3", inputTokens: 2000, outputTokens: 200 },
      true,
    );
    expect(meter.spentUsd).toBeCloseTo(0.00335);
    expect(meter.events.map((e) => [e.costUsd > 0, e.cached])).toEqual([
      [true, false],
      [false, true],
    ]);
    expect(meter.events[0]).toMatchObject({ scope, at: "2026-10-27T10:00:00.000Z" });
    expect(seen).toEqual(["judge_step", "judge_step"]);
  });

  it("blocks paid calls once the cap is reached", () => {
    const meter = new CostMeter({ scope, clock, capUsd: 0.005 });
    expect(() => meter.assertWithinBudget()).not.toThrow();
    meter.record("sam_find", { unit: "sam_images", images: 2 }, false);
    expect(meter.remainingUsd).toBe(0);
    expect(() => meter.assertWithinBudget()).toThrow(BudgetExceededError);
  });

  it("has no cap unless one is set", () => {
    const meter = new CostMeter({ scope, clock });
    meter.record("sam_find", { unit: "sam_images", images: 1000 }, false);
    expect(meter.remainingUsd).toBe(Infinity);
    expect(() => meter.assertWithinBudget()).not.toThrow();
  });
});
