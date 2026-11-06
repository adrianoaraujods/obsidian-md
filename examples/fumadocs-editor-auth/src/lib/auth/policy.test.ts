import { describe, expect, it } from "vitest";
import { authErrorMessage, DENIED_MESSAGE } from "./messages";
import { canEdit } from "./policy";

describe("canEdit", () => {
  it("lets any signed-in GitHub account edit by default", () => {
    expect(canEdit({ login: "octocat", email: "o@example.com" }, {})).toBe(
      true,
    );
  });

  it("denies the logins a fake-OAuth test run lists", () => {
    const env = {
      GITHUB_OAUTH_URL: "http://localhost:3105",
      TEST_DENY_LOGINS: "blocked,other",
    };
    const user = { login: "blocked", email: "b@example.com" };
    expect(canEdit(user, env)).toBe(false);
    expect(canEdit({ ...user, login: "fine" }, env)).toBe(true);
  });

  it("ignores the test deny list against the real GitHub", () => {
    expect(canEdit({ login: "blocked" }, { TEST_DENY_LOGINS: "blocked" })).toBe(
      true,
    );
  });
});

describe("authErrorMessage", () => {
  it("explains a cancelled or denied sign-in", () => {
    expect(authErrorMessage("access_denied")).toMatch(/cancel/i);
  });

  it("explains an account the hook rejected", () => {
    expect(DENIED_MESSAGE).toBe("This account isn't allowed to edit");
    expect(authErrorMessage("unable_to_create_user")).toBe(DENIED_MESSAGE);
  });

  it("falls back to a generic message", () => {
    expect(authErrorMessage("weird")).toMatch(/sign-in failed/i);
  });

  it("is silent without an error", () => {
    expect(authErrorMessage(null)).toBeNull();
  });
});
