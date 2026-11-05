import type { BrowserContext } from "@playwright/test";

import { TEST_SECRET } from "./config";
import { mintSessionCookies } from "./session-cookie";

/**
 * Starts the context already signed in as `login`, with a session cookie
 * minted from the test secret. Only the real-sign-in test goes through the
 * fake OAuth endpoints.
 */
export async function signInAs(
  context: BrowserContext,
  baseURL: string,
  login = "octocat",
) {
  const cookies = await mintSessionCookies({
    secret: TEST_SECRET,
    login,
    name: "The Octocat",
  });
  await context.addCookies(
    cookies.map((cookie) => ({ ...cookie, url: baseURL })),
  );
}
