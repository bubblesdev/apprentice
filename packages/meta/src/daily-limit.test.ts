import { BudgetExceededError, DailyLimitReachedError, type Usage } from "@apprentice/core";
import { describe, expect, it } from "vitest";
import { DailySpendLimit, utcDayStart } from "./daily-limit.js";
import { CostMeter } from "./meter.js";

const usage: Usage = {
  unit: "tokens",
  model: "muse-spark-1.3",
  inputTokens: 1000,
  outputTokens: 100,
};
const costPerCall = (1000 * 1.25 + 100 * 4.25) / 1e6;

function clockAt(iso: string) {
  let now = new Date(iso);
  return { now: () => now, set: (next: string) => (now = new Date(next)) };
}

describe("DailySpendLimit", () => {
  it("is shared by meters and stops paid calls once the day's cap is used", () => {
    const clock = clockAt("2026-10-29T10:00:00Z");
    const daily = new DailySpendLimit({ capUsd: costPerCall * 2, clock });
    const guide = new CostMeter({
      scope: { kind: "guide", id: "g" },
      capUsd: 1,
      clock,
      shared: daily,
    });
    const session = new CostMeter({
      scope: { kind: "session", id: "s" },
      capUsd: 1,
      clock,
      shared: daily,
    });
    guide.assertWithinBudget();
    guide.record("draft_steps", usage, false);
    session.record("judge_step", usage, true);
    session.assertWithinBudget();
    session.record("judge_step", usage, false);
    expect(daily.spentTodayUsd).toBeCloseTo(costPerCall * 2);
    expect(() => guide.assertWithinBudget()).toThrow(DailyLimitReachedError);
    expect(() => session.assertWithinBudget()).toThrow(BudgetExceededError);
    expect(() => session.assertWithinBudget()).toThrow(/Today's spending limit of \$0\.00/);
  });

  it("counts spend recorded before a restart and resets on the next UTC day", () => {
    const clock = clockAt("2026-10-29T23:59:00Z");
    const daily = new DailySpendLimit({ capUsd: 2, spentTodayUsd: 2, clock });
    expect(() => daily.assertWithinBudget()).toThrow(DailyLimitReachedError);
    clock.set("2026-10-30T00:00:01Z");
    expect(() => daily.assertWithinBudget()).not.toThrow();
    expect(daily.spentTodayUsd).toBe(0);
  });

  it("starts the day at midnight UTC", () => {
    expect(utcDayStart(new Date("2026-10-29T22:30:00+01:00"))).toBe("2026-10-29T00:00:00.000Z");
  });
});
