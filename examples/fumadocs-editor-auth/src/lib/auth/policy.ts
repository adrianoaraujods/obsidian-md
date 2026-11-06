type Env = Record<string, string | undefined>;

export type Candidate = { login: string; email?: string | null };

/**
 * Who may edit. Runs when someone signs in; returning `false` rejects the
 * sign-in with "This account isn't allowed to edit".
 *
 * By default any GitHub account may edit, and the real gate is the write
 * credential. To restrict who may edit, uncomment the allow-list below (or
 * check `email` against a domain). It lives here, not in an env var, so the
 * rule is code you review.
 */
export function canEdit(user: Candidate, env: Env = process.env): boolean {
  // const ALLOWED_LOGINS = ["your-login", "a-teammate"];
  // if (!ALLOWED_LOGINS.includes(user.login)) return false;

  // Playwright only: lets the denial path be tested against the fake OAuth
  // server. Ignored unless GitHub's OAuth pages are overridden.
  if (env.GITHUB_OAUTH_URL && env.TEST_DENY_LOGINS) {
    const denied = env.TEST_DENY_LOGINS.split(",").map((s) => s.trim());
    if (denied.includes(user.login)) return false;
  }

  return true;
}
