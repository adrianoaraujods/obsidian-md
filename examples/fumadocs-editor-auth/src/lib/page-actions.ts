type Env = Record<string, string | undefined>;

const clean = (value: string | undefined) => value?.trim() ?? "";

/**
 * The `blob` URL of a Note's file on GitHub, or `null` unless the repo,
 * branch and Vault subdirectory variables are all set.
 *
 * @param notePath the Note's path relative to the Vault, e.g. `Folder/Note.md`
 */
export function githubBlobUrl(env: Env, notePath: string): string | null {
  const repo = clean(env.GITHUB_REPO);
  const branch = clean(env.GITHUB_BRANCH);
  const vaultPath = clean(env.VAULT_PATH).replace(/^\/+|\/+$/g, "");
  if (!repo || !branch || !vaultPath) return null;

  const file = `${vaultPath}/${notePath}`.split("/").map(encodeURIComponent);
  return `https://github.com/${repo}/blob/${branch.split("/").map(encodeURIComponent).join("/")}/${file.join("/")}`;
}

/** Route of a Note's raw Markdown export. */
export function rawMarkdownPath(notePath: string): string {
  return `/raw/${notePath.split("/").map(encodeURIComponent).join("/")}`;
}
