import { DailyLimitReachedError, systemClock, type Clock } from "@apprentice/core";

/** A limit shared by many meters, such as one deployment's spend across all guides and sessions. */
export interface SpendLimit {
  assertWithinBudget(): void;
  add(costUsd: number): void;
}

export interface DailySpendLimitOptions {
  capUsd: number;
  /** Spend already recorded today (UTC), e.g. read from `usage_events` at start-up. */
  spentTodayUsd?: number;
  clock?: Clock;
}

/** Start of the UTC day containing `at`, as an ISO string. */
export function utcDayStart(at: Date): string {
  return `${at.toISOString().slice(0, 10)}T00:00:00.000Z`;
}

/** Caps total paid spend per UTC day, so an open deployment can't drain the credits. */
export class DailySpendLimit implements SpendLimit {
  private readonly clock: Clock;
  private day: string;
  private spent: number;

  constructor(private readonly options: DailySpendLimitOptions) {
    this.clock = options.clock ?? systemClock;
    this.day = utcDayStart(this.clock.now());
    this.spent = options.spentTodayUsd ?? 0;
  }

  get spentTodayUsd(): number {
    this.rollOver();
    return this.spent;
  }

  assertWithinBudget(): void {
    this.rollOver();
    if (this.spent >= this.options.capUsd)
      throw new DailyLimitReachedError(this.spent, this.options.capUsd);
  }

  add(costUsd: number): void {
    this.rollOver();
    this.spent += costUsd;
  }

  private rollOver(): void {
    const today = utcDayStart(this.clock.now());
    if (today !== this.day) {
      this.day = today;
      this.spent = 0;
    }
  }
}
