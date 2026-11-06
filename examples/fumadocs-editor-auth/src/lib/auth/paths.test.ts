import { describe, expect, it } from "vitest";
import { editSignInPath, isLocalPath } from "./paths";

describe("editSignInPath", () => {
  it("returns to the same editor route, and to the Note when sign-in fails", () => {
    expect(editSignInPath(["folder", "note"])).toBe(
      "/api/sign-in?callbackURL=%2Fedit%2Ffolder%2Fnote&errorCallbackURL=%2Ffolder%2Fnote",
    );
  });

  it("handles the home Note", () => {
    expect(editSignInPath([])).toBe(
      "/api/sign-in?callbackURL=%2Fedit&errorCallbackURL=%2F",
    );
  });
});

describe("isLocalPath", () => {
  it.each(["/", "/edit/a", "/a?b=1"])("accepts %s", (path) => {
    expect(isLocalPath(path)).toBe(true);
  });
  it.each(["", "//evil.com", "/\\evil.com", "https://evil.com", "evil"])(
    "rejects %j",
    (path) => {
      expect(isLocalPath(path)).toBe(false);
    },
  );
});
