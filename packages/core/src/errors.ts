/** A metered scope has used its budget; no further paid calls are made. */
export class BudgetExceededError extends Error {
  constructor(
    readonly spentUsd: number,
    readonly capUsd: number,
  ) {
    super(`Budget of $${capUsd.toFixed(2)} used ($${spentUsd.toFixed(4)} spent)`);
    this.name = "BudgetExceededError";
  }
}

/** The deployment's spending limit for the day is used; paid calls resume the next UTC day. */
export class DailyLimitReachedError extends BudgetExceededError {
  constructor(spentUsd: number, capUsd: number) {
    super(spentUsd, capUsd);
    this.message = `Today's spending limit of $${capUsd.toFixed(2)} is used. Try again tomorrow.`;
    this.name = "DailyLimitReachedError";
  }
}
