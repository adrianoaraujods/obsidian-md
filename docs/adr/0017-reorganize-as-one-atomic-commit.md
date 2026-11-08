# Reorganize a Vault as one atomic commit

The Manager stages moves, renames, reorders and Separator edits in memory and applies them as a single commit through the Git Data API (new tree, commit, then ref update). The commit also carries every link rewrite and every `meta.json` change the staged set needs, so the Vault is never deployed with half a reorganization in it. The storage interface grows a `commit(changeset, base)` operation next to `read`, `write`, `create` and `delete`; the filesystem adapter applies a changeset atomically and reports a tree hash as `base`, so a stale base fails with the same error shape as on GitHub. This supersedes the "rename is post-MVP" sentence of ADR 0012 and the order of releases D and G in the sequencing ticket (#76): the `meta.json` editor no longer waits for rename.

The commit subject extends ADR 0015: `Reorganize <n> items`, or `Move <path>` / `Rename <path>` when the set is a single change. The body lists the changes and carries the same read-only `Edited-with` / `Edited-by` trailer.

The Manager works on the deployed Vault, like the Note editor, and locks while HEAD is ahead of the deployed build, whoever caused it. If a commit lands between opening the Manager and Apply, the changeset is rebased when none of the touched files changed, and the user is asked to reload otherwise. It never forces the ref.

## Considered options

- **One commit per drop**: simple, but a deploy per drag, and a half-finished reorganization would be live with broken links in between. Rejected.
- **Folders as `.gitkeep` or empty `meta.json`**: would let a folder exist by itself. Rejected; a folder still exists only through the Notes inside it (#73).
- **Folder groups (`(name)` directories) for grouping**: a real directory that Obsidian shows and that path-style links must follow. Rejected in favour of Separators, which are only a `pages` entry in `meta.json`.
- **Redirects for changed URLs**: need a framework-specific file the Examples would have to read. Not in this release; the confirm dialog warns that URLs will change.

## Consequences

Rename and move change a Note's Slug, so external links and bookmarks break. Wiki Links, Embeds, Block References, Markdown links and Frontmatter links inside the Vault are rewritten. Anything in the Vault's `meta.json` files that the Manager does not model (other keys, links, `...folder`, `!name`) is preserved as it was.
