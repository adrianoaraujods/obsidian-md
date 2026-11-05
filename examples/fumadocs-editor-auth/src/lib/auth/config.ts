import { betterAuth } from "better-auth";

import type { AppEnv } from "../env";
import { canEdit } from "./policy";

type GithubProfile = { login: string; email?: string | null };

/**
 * Better Auth with no database: the session lives in encrypted cookies. It
 * proves identity only (GitHub's default `read:user` and `user:email`
 * scopes), so a visitor's token reaches nothing. Saves are committed by a
 * separate server-side credential.
 */
export function createAuth(env: AppEnv) {
  return betterAuth({
    secret: env.authSecret,
    baseURL: env.authUrl,
    // No `database` and no `secondaryStorage`: that is what makes it stateless.
    socialProviders: {
      github: {
        clientId: env.githubClientId,
        clientSecret: env.githubClientSecret,
        mapProfileToUser: (profile: GithubProfile) => ({
          login: profile.login,
        }),
      },
    },
    user: {
      additionalFields: {
        login: { type: "string", required: false },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const login = (user as { login?: string }).login ?? "";
            // Returning false rejects the sign-in. Better Auth sends the
            // visitor back with ?error=unable_to_create_user, where a toast
            // says "This account isn't allowed to edit".
            if (!canEdit({ login, email: user.email })) return false;
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
