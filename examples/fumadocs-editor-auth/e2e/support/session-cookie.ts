import { makeSignature, symmetricEncodeJWT } from "better-auth/crypto";

export type MintedCookie = { name: string; value: string };

/**
 * Mints the cookies Better Auth sets after a sign-in, from the test
 * `BETTER_AUTH_SECRET` alone, so a test can start already signed in without
 * the GitHub round trip. Stateless Better Auth keeps the whole session in
 * these cookies, so there is nothing else to seed.
 *
 * Cookie names assume an `http://` `BETTER_AUTH_URL` (no `__Secure-` prefix).
 */
export async function mintSessionCookies(options: {
  secret: string;
  login: string;
  name?: string;
  /** Session lifetime in seconds. Defaults to one hour. */
  maxAge?: number;
}): Promise<MintedCookie[]> {
  const { secret, login, name = login, maxAge = 3600 } = options;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + maxAge * 1000);
  const userId = `test-${login}`;
  const token = `token-${login}`;

  const payload = {
    session: {
      id: `session-${login}`,
      token,
      userId,
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    user: {
      id: userId,
      name,
      email: `${login}@users.noreply.github.com`,
      emailVerified: true,
      image: `https://avatars.githubusercontent.com/${login}`,
      login,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    updatedAt: now.getTime(),
    version: "1",
  };

  const sessionData = await symmetricEncodeJWT(
    payload,
    secret,
    "better-auth-session",
    maxAge,
  );
  const signature = await makeSignature(token, secret);

  return [
    {
      name: "better-auth.session_token",
      value: encodeURIComponent(`${token}.${signature}`),
    },
    { name: "better-auth.session_data", value: sessionData },
  ];
}
