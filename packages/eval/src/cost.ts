import type { UsageEvent } from "@apprentice/core";
import type { CoachPolicy } from "@apprentice/coach";

function sumByScope(
  events: readonly UsageEvent[],
  kind: UsageEvent["scope"]["kind"],
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const e of events) {
    if (e.scope.kind !== kind) continue;
    totals.set(e.scope.id, (totals.get(e.scope.id) ?? 0) + e.costUsd);
  }
  return totals;
}

export interface CostSummary {
  count: number;
  totalUsd: number;
  meanUsd: number | null;
  maxUsd: number | null;
}

function summarise(values: number[]): CostSummary {
  const totalUsd = values.reduce((a, b) => a + b, 0);
  return {
    count: values.length,
    totalUsd,
    meanUsd: values.length ? totalUsd / values.length : null,
    maxUsd: values.length ? Math.max(...values) : null,
  };
}

/** Cost of building each guide, from metered usage. Budget target: <= $1 per 5-minute source. */
export function costPerGuide(events: readonly UsageEvent[]): CostSummary {
  return summarise([...sumByScope(events, "guide").values()]);
}

/**
 * Cost per minute of live coaching, per session, from metered usage and each session's length.
 * Budget target: <= $0.05 per minute. Sessions without a known length are left out.
 */
export function costPerCoachingMinute(
  events: readonly UsageEvent[],
  minutesBySession: Readonly<Record<string, number>>,
): CostSummary {
  const perMinute: number[] = [];
  for (const [id, usd] of sumByScope(events, "session")) {
    const minutes = minutesBySession[id];
    if (minutes && minutes > 0) perMinute.push(usd / minutes);
  }
  return summarise(perMinute);
}

/**
 * Planning estimate before real sessions exist: what a minute spent verifying costs if the
 * client samples at the policy's rate and each sample is one judge call.
 */
export function projectedVerifyingCostPerMinute(
  costPerJudgementUsd: number,
  policy: Pick<CoachPolicy, "sampleIntervalMs">,
): number {
  return costPerJudgementUsd * (60_000 / policy.sampleIntervalMs);
}
