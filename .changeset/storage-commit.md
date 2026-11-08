---
"codemirror-obsidian-md": minor
---

Storage gains an atomic `commit(changeset, base, message?)` and `base()`: a `Changeset` of `Change`s (rename, write, delete) lands as one commit on the Vault's current base, so a reorganization is all or nothing. The GitHub storage uses the Git Data API and never forces the ref; the filesystem storage reports a tree hash as its base. A base that moved throws `StaleBaseError` (test with `isStaleBaseError`), and a rename onto a taken path throws `AlreadyExistsError`.
