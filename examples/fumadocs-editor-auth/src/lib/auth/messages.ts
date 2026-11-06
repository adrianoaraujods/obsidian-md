export const DENIED_MESSAGE = "This account isn't allowed to edit";

/**
 * What a visitor reads in the toast when sign-in sends them back with
 * `?error=<code>`. `null` means nothing to say.
 */
export function authErrorMessage(code: string | null): string | null {
  if (!code) return null;
  if (code === "access_denied") return "Sign-in was cancelled.";
  // A Better Auth hook that rejects the new user surfaces as this code.
  if (code === "unable_to_create_user") return DENIED_MESSAGE;
  return "Sign-in failed. Try again.";
}
