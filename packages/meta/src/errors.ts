/** The model answered, but not in the shape we asked for. */
export class ModelOutputError extends Error {
  constructor(
    message: string,
    readonly raw: string,
  ) {
    super(`${message}: ${raw.slice(0, 200)}`);
    this.name = "ModelOutputError";
  }
}

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

/** The adapter cannot send this kind of media to the model. */
export class UnsupportedMediaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedMediaError";
  }
}
