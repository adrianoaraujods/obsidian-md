import { describe, expect, it } from "vitest";
import { EnvError, parseEnv, requireRepoInProduction } from "./env";

const valid = {
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "https://wiki.example.com",
  GITHUB_CLIENT_ID: "client-id",
  GITHUB_CLIENT_SECRET: "client-secret",
  GITHUB_REPO: "acme/wiki",
  GITHUB_BRANCH: "main",
  VAULT_PATH: "vault",
  GITHUB_TOKEN: "ghp_token",
};

function problems(env: Record<string, string | undefined>): string {
  try {
    parseEnv(env);
  } catch (error) {
    expect(error).toBeInstanceOf(EnvError);
    return (error as Error).message;
  }
  throw new Error("expected parseEnv to throw");
}

describe("parseEnv", () => {
  it("accepts a complete configuration", () => {
    const env = parseEnv(valid);
    expect(env.githubRepo).toBe("acme/wiki");
    expect(env.githubBranch).toBe("main");
    expect(env.credential).toEqual({ kind: "token", token: "ghp_token" });
  });

  it("lists every missing variable in one error", () => {
    const message = problems({});
    for (const name of [
      "BETTER_AUTH_SECRET",
      "BETTER_AUTH_URL",
      "GITHUB_CLIENT_ID",
      "GITHUB_CLIENT_SECRET",
    ]) {
      expect(message).toContain(name);
    }
  });

  it("lists malformed values alongside missing ones", () => {
    const message = problems({
      ...valid,
      BETTER_AUTH_SECRET: "short",
      BETTER_AUTH_URL: "not a url",
      GITHUB_REPO: "no-slash",
      GITHUB_CLIENT_ID: undefined,
    });
    expect(message).toContain("BETTER_AUTH_SECRET");
    expect(message).toContain("BETTER_AUTH_URL");
    expect(message).toContain("GITHUB_REPO");
    expect(message).toContain("GITHUB_CLIENT_ID");
  });

  it("treats blank values as missing", () => {
    expect(problems({ ...valid, GITHUB_CLIENT_SECRET: "   " })).toContain(
      "GITHUB_CLIENT_SECRET",
    );
  });

  it("prefers the App installation over the token when both are set", () => {
    const env = parseEnv({
      ...valid,
      GITHUB_APP_ID: "1",
      GITHUB_APP_PRIVATE_KEY: "line1\\nline2",
      GITHUB_APP_INSTALLATION_ID: "2",
    });
    expect(env.credential).toEqual({
      kind: "app",
      appId: "1",
      privateKey: "line1\nline2",
      installationId: "2",
    });
  });

  it("rejects a half-configured App", () => {
    const message = problems({
      ...valid,
      GITHUB_TOKEN: undefined,
      GITHUB_APP_ID: "1",
    });
    expect(message).toContain("GITHUB_APP_PRIVATE_KEY");
    expect(message).toContain("GITHUB_APP_INSTALLATION_ID");
  });

  it("needs a credential once a repo is set", () => {
    expect(problems({ ...valid, GITHUB_TOKEN: undefined })).toContain(
      "GITHUB_TOKEN",
    );
  });

  it("needs no repo or credential in development", () => {
    const env = parseEnv({
      ...valid,
      NODE_ENV: "development",
      GITHUB_REPO: undefined,
      GITHUB_TOKEN: undefined,
    });
    expect(env.githubRepo).toBeNull();
    expect(env.credential).toBeNull();
  });

  it("requires the repo in production", () => {
    const message = problems({
      ...valid,
      NODE_ENV: "production",
      GITHUB_REPO: undefined,
    });
    expect(message).toContain("GITHUB_REPO");
  });

  it("defaults the GitHub base URLs", () => {
    const env = parseEnv(valid);
    expect(env.githubOauthUrl).toBe("https://github.com");
    expect(env.githubApiUrl).toBe("https://api.github.com");
  });

  it("honours overridden GitHub base URLs without a trailing slash", () => {
    const env = parseEnv({
      ...valid,
      GITHUB_OAUTH_URL: "http://localhost:3105/",
      GITHUB_API_URL: "http://localhost:3105/api/",
    });
    expect(env.githubOauthUrl).toBe("http://localhost:3105");
    expect(env.githubApiUrl).toBe("http://localhost:3105/api");
  });
});

describe("requireRepoInProduction", () => {
  it("throws in production without GITHUB_REPO", () => {
    expect(() =>
      requireRepoInProduction({ NODE_ENV: "production" }),
    ).toThrowError(/GITHUB_REPO/);
  });
  it("passes in production with it", () => {
    expect(() =>
      requireRepoInProduction({
        NODE_ENV: "production",
        GITHUB_REPO: "acme/wiki",
      }),
    ).not.toThrow();
  });
  it("passes in development without it", () => {
    expect(() =>
      requireRepoInProduction({ NODE_ENV: "development" }),
    ).not.toThrow();
  });
  it("skips the check while building", () => {
    expect(() =>
      requireRepoInProduction({
        NODE_ENV: "production",
        NEXT_PHASE: "phase-production-build",
      }),
    ).not.toThrow();
  });
});
