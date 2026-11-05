import type { AppEnv } from "../env";

type Bases = Pick<AppEnv, "githubOauthUrl" | "githubApiUrl">;

const REAL_OAUTH = "https://github.com";
const REAL_API = "https://api.github.com";

/**
 * Better Auth's GitHub provider hard-codes GitHub's URLs. When
 * `GITHUB_OAUTH_URL` / `GITHUB_API_URL` are set (the Playwright suite points
 * them at a fake), requests to GitHub are sent there instead.
 */
export function rewriteGithubUrl(url: string, bases: Bases): string {
  if (url.startsWith(`${REAL_OAUTH}/`)) {
    return bases.githubOauthUrl + url.slice(REAL_OAUTH.length);
  }
  if (url.startsWith(`${REAL_API}/`)) {
    return bases.githubApiUrl + url.slice(REAL_API.length);
  }
  return url;
}

let installed = false;

/** Routes the server's own fetches through `rewriteGithubUrl`, once. */
export function installGithubUrlOverrides(bases: Bases): void {
  const overridden =
    bases.githubOauthUrl !== REAL_OAUTH || bases.githubApiUrl !== REAL_API;
  if (installed || !overridden) return;
  installed = true;

  const realFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    if (typeof input === "string") {
      return realFetch(rewriteGithubUrl(input, bases), init);
    }
    if (input instanceof URL) {
      return realFetch(rewriteGithubUrl(input.href, bases), init);
    }
    return realFetch(
      new Request(rewriteGithubUrl(input.url, bases), input),
      init,
    );
  };
}
