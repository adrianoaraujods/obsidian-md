import { describe, expect, it } from "vitest";
import { githubBlobUrl, rawMarkdownPath } from "./page-actions";

describe("githubBlobUrl", () => {
  const env = {
    GITHUB_REPO: "acme/wiki",
    GITHUB_BRANCH: "main",
    VAULT_PATH: "docs/vault",
  };

  it("points at the Note's file on the repo, branch and subdirectory", () => {
    expect(githubBlobUrl(env, "Folder/My Note.md")).toBe(
      "https://github.com/acme/wiki/blob/main/docs/vault/Folder/My%20Note.md",
    );
  });
  it("tolerates stray slashes in VAULT_PATH", () => {
    expect(githubBlobUrl({ ...env, VAULT_PATH: "/vault/" }, "a.md")).toBe(
      "https://github.com/acme/wiki/blob/main/vault/a.md",
    );
  });
  it.each(["GITHUB_REPO", "GITHUB_BRANCH", "VAULT_PATH"] as const)(
    "is null when %s is unset",
    (key) => {
      expect(githubBlobUrl({ ...env, [key]: undefined }, "a.md")).toBeNull();
    },
  );
  it("is null when a variable is blank", () => {
    expect(githubBlobUrl({ ...env, GITHUB_REPO: " " }, "a.md")).toBeNull();
  });
});

describe("rawMarkdownPath", () => {
  it("maps a Vault file to its raw export route", () => {
    expect(rawMarkdownPath("Folder/My Note.md")).toBe(
      "/raw/Folder/My%20Note.md",
    );
  });
});
