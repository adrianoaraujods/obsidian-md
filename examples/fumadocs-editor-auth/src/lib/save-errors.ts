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
