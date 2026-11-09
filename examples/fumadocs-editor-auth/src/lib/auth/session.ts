import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAuth } from ".";
import { editSignInPath, manageSignInPath } from "./paths";

/** The signed-in editor, or `null`. Call from route handlers and server components. */
export async function getSession() {
  return getAuth().api.getSession({ headers: await headers() });
}

/**
 * Guards the editor route tree: a signed-out visitor goes straight to GitHub
 * sign-in and comes back to the same editor route.
 */
export async function requireEditor(slug: string[]) {
  const session = await getSession();
  if (!session) redirect(editSignInPath(slug));
  return session;
}

/**
 * Guards the Manager: a signed-out visitor goes straight to GitHub sign-in and
 * comes back to the Manager.
 */
export async function requireManager(focus?: string) {
  const session = await getSession();
  if (!session) redirect(manageSignInPath(focus));
  return session;
}
