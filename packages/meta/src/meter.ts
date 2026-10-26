import {
  systemClock,
  type Clock,
  type Usage,
  type UsageEvent,
  type UsageScope,
} from "@apprentice/core";
import { BudgetExceededError } from "./errors.js";
import { usageCost } from "./pricing.js";

export interface CostMeterOptions {
  scope: UsageScope;
  /** Hard cap for this scope in US dollars. Omit for no cap (evals on a known budget). */
  capUsd?: number;
  clock?: Clock;
  /** Called with every event, e.g. to persist `usage_events`. */
  onEvent?: (event: UsageEvent) => void;
}

/**
 * Records every model call against one guide, session or eval run, and refuses paid calls once
 * the cap is reached. Cached replays are recorded at zero cost so reports show what was reused.
 */
export class CostMeter {
  private readonly recorded: UsageEvent[] = [];
  private spent = 0;
  private readonly clock: Clock;

  constructor(private readonly options: CostMeterOptions) {
    this.clock = options.clock ?? systemClock;
  }

  get scope(): UsageScope {
    return this.options.scope;
  }

  get spentUsd(): number {
    return this.spent;
  }

  get remainingUsd(): number {
    return this.options.capUsd === undefined
      ? Infinity
      : Math.max(0, this.options.capUsd - this.spent);
  }

  get events(): readonly UsageEvent[] {
    return this.recorded;
  }

  /** Call before a paid request. */
  assertWithinBudget(): void {
    const cap = this.options.capUsd;
    if (cap !== undefined && this.spent >= cap) throw new BudgetExceededError(this.spent, cap);
  }

  record(operation: string, usage: Usage, cached: boolean): UsageEvent {
    const costUsd = cached ? 0 : usageCost(usage);
    const event: UsageEvent = {
      scope: this.options.scope,
      operation,
      usage,
      costUsd,
      cached,
      at: this.clock.now().toISOString(),
    };
    this.spent += costUsd;
    this.recorded.push(event);
    this.options.onEvent?.(event);
    return event;
  }
}
