import { describe, expect, it } from "vitest";
import { mintSessionCookies } from "../../../e2e/support/session-cookie";
import { parseEnv } from "../env";
import { createAuth } from "./config";

const secret = "test-secret-test-secret-test-secret-0123";
const env = parseEnv({
  BETTER_AUTH_SECRET: secret,
  BETTER_AUTH_URL: "http://localhost:3104",
  GITHUB_CLIENT_ID: "id",
  GITHUB_CLIENT_SECRET: "secret",
});

const cookieHeader = (cookies: { name: string; value: string }[]) =>
  cookies.map((c) => `${c.name}=${c.value}`).join("; ");

describe("a session cookie minted from the test secret", () => {
  it("signs the visitor in without any GitHub round trip", async () => {
    const cookies = await mintSessionCookies({
      secret,
      login: "octocat",
      name: "The Octocat",
    });
    const auth = createAuth(env);
    const session = await auth.api.getSession({
      headers: new Headers({ cookie: cookieHeader(cookies) }),
    });

    expect(session?.user.login).toBe("octocat");
    expect(session?.user.name).toBe("The Octocat");
  });

  it("is rejected when minted from another secret", async () => {
    const cookies = await mintSessionCookies({
      secret: "another-secret-another-secret-another-0",
      login: "octocat",
    });
    const auth = createAuth(env);
    const session = await auth.api.getSession({
      headers: new Headers({ cookie: cookieHeader(cookies) }),
    });
    expect(session).toBeNull();
  });

  it("sees no one without cookies", async () => {
    const auth = createAuth(env);
    expect(await auth.api.getSession({ headers: new Headers() })).toBeNull();
  });
});
