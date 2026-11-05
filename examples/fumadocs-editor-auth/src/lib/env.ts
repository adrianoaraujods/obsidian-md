type Source = Record<string, string | undefined>;

/** The write credential: a fine-grained PAT, or a GitHub App installation. */
export type Credential =
  | { kind: "token"; token: string }
  | { kind: "app"; appId: string; privateKey: string; installationId: string };

export type AppEnv = {
  authSecret: string;
  authUrl: string;
  githubClientId: string;
  githubClientSecret: string;
  /** `owner/name`, or `null` in development (the Vault is then the local disk). */
  githubRepo: string | null;
  /** `null` means the repo's default branch. */
  githubBranch: string | null;
  vaultPath: string;
  credential: Credential | null;
  /** Origin of GitHub's OAuth pages. Overridable so tests can use a fake. */
  githubOauthUrl: string;
  /** Origin of GitHub's REST API. Overridable so tests can use a fake. */
  githubApiUrl: string;
};

/** One error that lists every missing or malformed variable. */
export class EnvError extends Error {
  constructor(readonly problems: string[]) {
    super(
      `Invalid environment (see .env.example):\n${problems
        .map((problem) => `  - ${problem}`)
        .join("\n")}`,
    );
    this.name = "EnvError";
  }
}

const clean = (value: string | undefined) => value?.trim() ?? "";
const stripSlash = (url: string) => url.replace(/\/+$/, "");

function isUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads and checks every variable the Example uses. Throws one `EnvError`
 * naming all the problems, so a copier fixes them in a single pass.
 */
export function parseEnv(source: Source): AppEnv {
  const problems: string[] = [];
  const production = source.NODE_ENV === "production";

  const required = (name: string): string => {
    const value = clean(source[name]);
    if (!value) problems.push(`${name} is missing`);
    return value;
  };

  const authSecret = required("BETTER_AUTH_SECRET");
  if (authSecret && authSecret.length < 32) {
    problems.push("BETTER_AUTH_SECRET must be at least 32 characters");
  }

  const authUrl = required("BETTER_AUTH_URL");
  if (authUrl && !isUrl(authUrl)) {
    problems.push(
      "BETTER_AUTH_URL must be a URL, e.g. https://wiki.example.com",
    );
  }

  const githubClientId = required("GITHUB_CLIENT_ID");
  const githubClientSecret = required("GITHUB_CLIENT_SECRET");

  const repo = clean(source.GITHUB_REPO);
  if (!repo && production) {
    problems.push("GITHUB_REPO is missing (required in production)");
  }
  if (repo && !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    problems.push("GITHUB_REPO must look like owner/name");
  }

  const vaultPath = clean(source.VAULT_PATH).replace(/^\/+|\/+$/g, "");
  if (vaultPath.split("/").includes("..")) {
    problems.push("VAULT_PATH must not contain a .. segment");
  }

  const credential = parseCredential(source, Boolean(repo), problems);

  const oauthUrl = stripSlash(clean(source.GITHUB_OAUTH_URL));
  const apiUrl = stripSlash(clean(source.GITHUB_API_URL));
  if (oauthUrl && !isUrl(oauthUrl)) {
    problems.push("GITHUB_OAUTH_URL must be a URL");
  }
  if (apiUrl && !isUrl(apiUrl)) problems.push("GITHUB_API_URL must be a URL");

  if (problems.length > 0) throw new EnvError(problems);

  return {
    authSecret,
    authUrl,
    githubClientId,
    githubClientSecret,
    githubRepo: repo || null,
    githubBranch: clean(source.GITHUB_BRANCH) || null,
    vaultPath,
    credential,
    githubOauthUrl: oauthUrl || "https://github.com",
    githubApiUrl: apiUrl || "https://api.github.com",
  };
}

function parseCredential(
  source: Source,
  needed: boolean,
  problems: string[],
): Credential | null {
  const appVars = [
    "GITHUB_APP_ID",
    "GITHUB_APP_PRIVATE_KEY",
    "GITHUB_APP_INSTALLATION_ID",
  ] as const;
  const appSet = appVars.filter((name) => clean(source[name]));

  if (appSet.length > 0) {
    const missing = appVars.filter((name) => !clean(source[name]));
    for (const name of missing) {
      problems.push(`${name} is missing (the GitHub App needs all three)`);
    }
    if (missing.length === 0) {
      return {
        kind: "app",
        appId: clean(source.GITHUB_APP_ID),
        // Private keys are usually pasted into one line with literal \n.
        privateKey: clean(source.GITHUB_APP_PRIVATE_KEY).replace(/\\n/g, "\n"),
        installationId: clean(source.GITHUB_APP_INSTALLATION_ID),
      };
    }
    return null;
  }

  const token = clean(source.GITHUB_TOKEN);
  if (token) return { kind: "token", token };
  if (needed) {
    problems.push(
      "GITHUB_TOKEN is missing (or set GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY and GITHUB_APP_INSTALLATION_ID)",
    );
  }
  return null;
}

/**
 * A deployed Wiki must never write to disk by mistake, so a production server
 * refuses to start without a repo. Skipped during `next build`, which needs no
 * secrets.
 */
export function requireRepoInProduction(source: Source): void {
  if (source.NODE_ENV !== "production") return;
  if (source.NEXT_PHASE === "phase-production-build") return;
  if (clean(source.GITHUB_REPO)) return;
  throw new EnvError([
    "GITHUB_REPO is missing (required in production, so a deploy never writes to disk)",
  ]);
}

let cached: AppEnv | undefined;

/** Validated environment, checked once on the first request. */
export function getEnv(): AppEnv {
  cached ??= parseEnv(process.env);
  return cached;
}
