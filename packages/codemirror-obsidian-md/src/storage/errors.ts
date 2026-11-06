/** Who made a newer change and when, when the backend knows. */
export interface NewerChange {
  author?: string;
  /** ISO 8601 timestamp. */
  time?: string;
}

/** The SHA given to `write` or `delete` is no longer the current one. */
export class StaleShaError extends Error {
  readonly code = "stale-sha";
  readonly path: string;
  readonly newer: NewerChange | undefined;

  constructor(path: string, newer?: NewerChange) {
    super(`"${path}" changed since it was read`);
    this.name = "StaleShaError";
    this.path = path;
    this.newer = newer;
  }
}

/** `create` was called for a path that already exists. */
export class AlreadyExistsError extends Error {
  readonly code = "already-exists";
  readonly path: string;

  constructor(path: string) {
    super(`"${path}" already exists`);
    this.name = "AlreadyExistsError";
    this.path = path;
  }
}

export function isStaleShaError(error: unknown): error is StaleShaError {
  return error instanceof StaleShaError;
}

export function isAlreadyExistsError(
  error: unknown,
): error is AlreadyExistsError {
  return error instanceof AlreadyExistsError;
}
