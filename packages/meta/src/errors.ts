export { BudgetExceededError } from "@apprentice/core";

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

/** The adapter cannot send this kind of media to the model. */
export class UnsupportedMediaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedMediaError";
  }
}
