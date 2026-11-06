import { describe, expect, it } from "vitest";
import { rewriteGithubUrl } from "./github-urls";

const fake = {
  githubOauthUrl: "http://localhost:3105",
  githubApiUrl: "http://localhost:3105/api",
};
const real = {
  githubOauthUrl: "https://github.com",
  githubApiUrl: "https://api.github.com",
};

describe("rewriteGithubUrl", () => {
  it("points GitHub's OAuth pages at the configured origin", () => {
    expect(
      rewriteGithubUrl("https://github.com/login/oauth/authorize?x=1", fake),
    ).toBe("http://localhost:3105/login/oauth/authorize?x=1");
    expect(
      rewriteGithubUrl("https://github.com/login/oauth/access_token", fake),
    ).toBe("http://localhost:3105/login/oauth/access_token");
  });

  it("points GitHub's REST API at the configured origin", () => {
    expect(rewriteGithubUrl("https://api.github.com/user/emails", fake)).toBe(
      "http://localhost:3105/api/user/emails",
    );
  });

  it("leaves other URLs alone", () => {
    expect(rewriteGithubUrl("https://example.com/x", fake)).toBe(
      "https://example.com/x",
    );
  });

  it("changes nothing against the real GitHub", () => {
    expect(
      rewriteGithubUrl("https://github.com/login/oauth/authorize", real),
    ).toBe("https://github.com/login/oauth/authorize");
  });
});
