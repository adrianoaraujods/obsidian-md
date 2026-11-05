import { describe, expect, it } from "vitest";

import {
  AlreadyExistsError,
  isAlreadyExistsError,
  isStaleShaError,
  StaleShaError,
} from "../../src/storage/index.js";

describe("storage errors", () => {
  it("carries the newer change's author and time when known", () => {
    const error = new StaleShaError("a.md", {
      author: "Ada (@ada)",
      time: "2026-01-02T03:04:05Z",
    });
    expect(error.newer).toEqual({
      author: "Ada (@ada)",
      time: "2026-01-02T03:04:05Z",
    });
  });

  it("tells the two shapes apart", () => {
    const stale = new StaleShaError("a.md");
    const exists = new AlreadyExistsError("a.md");
    expect(isStaleShaError(stale)).toBe(true);
    expect(isStaleShaError(exists)).toBe(false);
    expect(isAlreadyExistsError(exists)).toBe(true);
    expect(isAlreadyExistsError(new Error("x"))).toBe(false);
  });
});
