import type { SaveLockOptions } from "codemirror-obsidian-md/editor";

type Source = Record<string, string | undefined>;

export type LockTimings = Pick<
  SaveLockOptions,
  "firstPollMs" | "intervalMs" | "timeoutMs"
>;

const FIELDS = [
  ["firstPollMs", "EDITOR_LOCK_FIRST_POLL_MS"],
  ["intervalMs", "EDITOR_LOCK_INTERVAL_MS"],
  ["timeoutMs", "EDITOR_LOCK_TIMEOUT_MS"],
] as const;

/**
 * Optional overrides for the deploy lock's poll timings (milliseconds), so
 * browser tests need not wait a minute. Unset, blank or non-positive values
 * leave the package defaults (1 minute, 5 seconds, 5 minutes).
 */
export function lockTimings(source: Source): LockTimings {
  const timings: LockTimings = {};
  for (const [field, name] of FIELDS) {
    const value = Number(source[name]);
    if (Number.isFinite(value) && value > 0) timings[field] = value;
  }
  return timings;
}
