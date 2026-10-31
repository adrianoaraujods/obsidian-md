/** A Slug as one string, for cache keys and HTML attributes. */
export function slugKey(slug: readonly string[]): string {
  return slug.join("/");
}

/** The Slug a `slugKey` was made from. */
export function slugFromKey(key: string): string[] {
  return key.split("/");
}
