# Reorganize a Vault as one atomic commit

The Manager stages moves, renames, reorders and Separator edits in memory and applies them as a single commit through the Git Data API (new tree, commit, then ref update). The commit also carries every link rewrite and every `meta.json` change the staged set needs, so the Vault is never deployed with half a reorganization in it. The storage interface grows a `commit(changeset, base, message?)` operation next to `read`, `write`, `create` and `delete`, with a `base()` to read the current base and an optional `changedSince(base)` that lists the Vault paths changed since one. The filesystem adapter applies a changeset atomically and reports a tree hash as `base`, so a stale base fails with the same error shape as on GitHub. This supersedes the "rename is post-MVP" sentence of ADR 0012 and the order of releases D and G in the sequencing ticket (#76): the `meta.json` editor no longer waits for rename.

The commit subject extends ADR 0015: `Reorganize <n> items`, or `Move <path>` / `Rename <path>` when the set is a single change. The body lists the changes and carries the same read-only `Edited-with` / `Edited-by` trailer. The host may word the subject and body (`message`); the adapter still adds the trailer, so nothing the host passes can forge it.

The Manager works on the deployed Vault, like the Note editor, and reuses its deploy lock: it locks while HEAD is ahead of the deployed build, whoever caused it, and after Apply until the new commit is live. If a commit lands between opening the Manager and Apply, the server retries on the new HEAD when `changedSince` shows none of the touched files changed, and refuses (409) so the user reloads otherwise, or when the adapter cannot tell. It never forces the ref. The open Example has no deployed build to wait for: it applies to disk in development only, and `/manage` is a 404 in production.

## Considered options

- **One commit per drop**: simple, but a deploy per drag, and a half-finished reorganization would be live with broken links in between. Rejected.
- **Folders as `.gitkeep` or empty `meta.json`**: would let a folder exist by itself. Rejected; a folder still exists only through the Notes inside it (#73).
- **Folder groups (`(name)` directories) for grouping**: a real directory that Obsidian shows and that path-style links must follow. Rejected in favour of Separators, which are only a `pages` entry in `meta.json`.
- **Redirects for changed URLs**: need a framework-specific file the Examples would have to read. Not in this release; the confirm dialog warns that URLs will change.

## Consequences

Rename and move change a Note's Slug, so external links and bookmarks break. Wiki Links, Embeds, Block References, Markdown links and Frontmatter links inside the Vault are rewritten. Anything in the Vault's `meta.json` files that the Manager does not model (other keys, links, `...folder`, `!name`) is preserved as it was.
