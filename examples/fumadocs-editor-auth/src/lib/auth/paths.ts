/** Only same-site paths are valid redirect targets. */
export function isLocalPath(path: string): boolean {
  return /^\/(?![/\\])/.test(path);
}

/**
 * Where a signed-out visitor is sent to reach the editor for a Note: straight
 * to GitHub sign-in, returning to the same editor route. A cancelled or denied
 * sign-in lands back on the read-only Note.
 */
export function editSignInPath(slug: string[]): string {
  const tail = slug.map(encodeURIComponent).join("/");
  const params = new URLSearchParams({
    callbackURL: tail ? `/edit/${tail}` : "/edit",
    errorCallbackURL: tail ? `/${tail}` : "/",
  });
  return `/api/sign-in?${params}`;
}

/**
 * Where a signed-out visitor to the Manager is sent: GitHub sign-in, returning
 * to the Manager (on the same item when `focus` is given). A cancelled or
 * denied sign-in lands on the home Note.
 */
export function manageSignInPath(focus?: string): string {
  const callbackURL = focus
    ? `/manage?${new URLSearchParams({ focus })}`
    : "/manage";
  return `/api/sign-in?${new URLSearchParams({ callbackURL, errorCallbackURL: "/" })}`;
}
