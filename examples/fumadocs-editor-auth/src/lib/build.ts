import { execFileSync } from "node:child_process";

type Source = Record<string, string | undefined>;

const SHA = /^[0-9a-f]{40}$/i;

function localHead(): string | null {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * The commit this build was made from: the host's variable (Vercel's), else
 * the local git HEAD, else `null`. Anything that is not a full SHA is ignored.
 */
export function resolveBuildSha(
  source: Source,
  readHead: () => string | null = localHead,
): string | null {
  const fromHost = source.VERCEL_GIT_COMMIT_SHA?.trim();
  if (fromHost && SHA.test(fromHost)) return fromHost;
  const head = readHead();
  return head && SHA.test(head) ? head : null;
}

let cached: { sha: string | null } | undefined;

/** Resolved once per server process. Server only: never import from a client module. */
export function getBuildSha(): string | null {
  cached ??= { sha: resolveBuildSha(process.env) };
  return cached.sha;
}

/**
 * The commit the deploy lock compares against. Normally the build's own SHA.
 * Under the fake GitHub (`GITHUB_OAUTH_URL` overridden, like
 * `TEST_DENY_LOGINS`), `TEST_BUILD_SHA_URL` names an endpoint that reports the
 * "deployed" commit, so a browser test decides when the deploy goes live.
 */
export async function resolveDeployedCommit(
  source: Source = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const url = source.TEST_BUILD_SHA_URL;
  if (!url || !source.GITHUB_OAUTH_URL) {
    return source === process.env ? getBuildSha() : resolveBuildSha(source);
  }
  try {
    const response = await fetchImpl(url, { cache: "no-store" });
    if (!response.ok) return null;
    const { sha } = (await response.json()) as { sha: unknown };
    return typeof sha === "string" && SHA.test(sha) ? sha : null;
  } catch {
    return null;
  }
}
