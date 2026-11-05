import { getEnv } from "../env";
import { type Auth, createAuth } from "./config";
import { installGithubUrlOverrides } from "./github-urls";

let auth: Auth | undefined;

/**
 * The Better Auth instance, created on first use so that `next build` needs
 * no secrets. Throws one readable `EnvError` if the environment is wrong.
 */
export function getAuth(): Auth {
  if (!auth) {
    const env = getEnv();
    installGithubUrlOverrides(env);
    auth = createAuth(env);
  }
  return auth;
}
