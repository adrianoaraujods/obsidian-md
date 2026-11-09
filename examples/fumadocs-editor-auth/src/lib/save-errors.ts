export const CREDENTIAL_MESSAGE =
  "Saving isn't configured correctly. Your text is kept. Tell the site owner.";

export const NETWORK_MESSAGE =
  "Couldn't reach the server. Your text is kept. Try again.";

/**
 * Words for a failed Save that is not a conflict. The notes route answers
 * every failure of the commit credential with a generic `storage-failed`
 * (the details stay in the server log), so that is what means "setup".
 */
export function saveErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return /\(\d{3}: storage-failed\)/.test(message)
    ? CREDENTIAL_MESSAGE
    : NETWORK_MESSAGE;
}

export const APPLY_CREDENTIAL_MESSAGE =
  "Applying isn't configured correctly. Your staged changes are kept. Tell the Wiki owner.";

export const APPLY_SESSION_MESSAGE =
  "You're signed out. Your staged changes are kept. Sign in again, then Apply.";

export const APPLY_NETWORK_MESSAGE =
  "Couldn't reach the server. Your staged changes are kept. Try again.";
