import { describe, expect, it } from "vitest";
import { editSignInPath, isLocalPath, manageSignInPath } from "./paths";

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

describe("manageSignInPath", () => {
  it("returns to the Manager, and to the home Note when sign-in fails", () => {
    expect(manageSignInPath()).toBe(
      "/api/sign-in?callbackURL=%2Fmanage&errorCallbackURL=%2F",
    );
  });

  it("keeps the item the Manager was opened on", () => {
    expect(manageSignInPath("Folder/My Note.md")).toBe(
      "/api/sign-in?callbackURL=%2Fmanage%3Ffocus%3DFolder%252FMy%2BNote.md&errorCallbackURL=%2F",
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
