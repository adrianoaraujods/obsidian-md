// Characters GitHub paths (and common filesystems) reject.
// biome-ignore lint/suspicious/noControlCharactersInRegex: control chars are the point
const FORBIDDEN = /[\\:*?"<>|\u0000-\u001f\u007f]/;

/** Why `path` cannot be a Vault-relative path, or `null` when it can. `label` names it in the message. */
export function checkSegments(path: string, label: string): string | null {
  if (path.startsWith("/")) return `The ${label} cannot start with a "/".`;
  for (const segment of path.split("/")) {
    if (segment === "..") return `The ${label} cannot contain a ".." segment.`;
    if (segment === "") return `The ${label} has an empty folder segment.`;
    if (segment === "." || segment.trim() !== segment)
      return `The ${label} has an invalid segment "${segment}".`;
    const bad = FORBIDDEN.exec(segment);
    if (bad) {
      const shown =
        bad[0] < " " || bad[0] === "\u007f"
          ? "A control character"
          : `"${bad[0]}"`;
      return `${shown} is not allowed in the ${label}.`;
    }
  }
  return null;
}
