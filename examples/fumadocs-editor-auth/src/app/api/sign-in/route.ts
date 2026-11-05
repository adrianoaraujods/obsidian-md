import { getAuth } from "@/lib/auth";
import { isLocalPath } from "@/lib/auth/paths";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * GET /api/sign-in?callbackURL=/edit/note&errorCallbackURL=/note
 *
 * Starts the GitHub OAuth flow with a plain redirect, so a link can send a
 * signed-out visitor straight to GitHub. (Better Auth's own sign-in endpoint
 * is POST-only.)
 */
export async function GET(request: Request) {
  const env = getEnv();
  const params = new URL(request.url).searchParams;
  const callbackURL = params.get("callbackURL") ?? "/";
  const errorCallbackURL = params.get("errorCallbackURL") ?? "/";
  if (!isLocalPath(callbackURL) || !isLocalPath(errorCallbackURL)) {
    return new Response("Invalid redirect target", { status: 400 });
  }

  const response = await getAuth().api.signInSocial({
    body: {
      provider: "github",
      callbackURL,
      errorCallbackURL,
      newUserCallbackURL: callbackURL,
      disableRedirect: true,
    },
    headers: request.headers,
    asResponse: true,
  });
  const { url } = (await response.json()) as { url: string };

  // The authorization URL points at GitHub; tests point it at a fake.
  const location = url.replace("https://github.com", env.githubOauthUrl);
  const headers = new Headers(response.headers);
  headers.delete("content-type");
  headers.delete("content-length");
  headers.set("location", location);
  return new Response(null, { status: 302, headers });
}
