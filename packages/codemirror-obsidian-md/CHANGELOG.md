# codemirror-obsidian-md

## 0.1.0

### Minor Changes

- a793d8b: Add Live Preview for Callouts and Embeds (`calloutEmbed`): a Callout renders with its type's color and icon like the Wiki, an Asset Embed renders its image and a Note Embed shows as a chip; each reveals its raw syntax while the cursor is inside.
- ea11534: Add the editor core: `createEditor` mounts a CodeMirror 6 editor on a Note's raw Markdown, re-parses it with the `remark-obsidian-md` pipeline debounced to idle, and exposes per-construct decoration providers and a cursor-reveal helper (`codemirror-obsidian-md/editor`). Saving returns exactly the document text.
- 3f2bf5d: Add the `codemirror-obsidian-md` package with the editor storage interface (`read`, `write`, `create`, `delete`, optional `lock`), its `StaleShaError` and `AlreadyExistsError` shapes, a filesystem adapter and a reusable adapter contract suite.
- af171b4: Add editor lock handling (`createSaveLock`): after a successful Save on a storage with the `lock` capability, the Note stays locked until `isDeployed(commit)` reports the deploy is live, polling after 1 minute then every 5 seconds up to 5 minutes (all configurable). At the timeout it offers Reload from GitHub and Keep waiting; without a build commit it shows a one-time notice and does not lock.
- eef3cbb: Add the editor save flow (`createSaveFlow`, `saveFlowExtension`, `mountConflictBanner`): saves through a `Storage`, tracks dirty state with a leave-page warning, and on a stale SHA keeps the text and exposes Copy my text, a confirmed Reload and an explicit Overwrite that re-runs Save through the host's confirm dialog. Host hooks: `confirm`, `subscribe`, `onSaved`, `onReload`.
- 1f74170: Add the GitHub storage module (`storage/github`, Contents API, PAT or GitHub App credential, injectable `fetch` and base URL), a route handler and a token-free browser fetch adapter (`storage/http`, `storage/client`), and an in-memory fake Contents API (`storage/github-fake`) for tests.
- 7b2766d: Add Live Preview for Obsidian inline syntax: `inlineProviders` render Wiki Links, Highlights (with Highlight Color), Comments, inline Footnotes and Block IDs in place and reveal the raw syntax under the cursor. `blockIdParser` adds Block IDs to the parse. Class names match the plugin Stylesheet and the Save payload is unchanged.
- 4a4b05b: Add `markdownProvider`, Live Preview for standard Markdown: headings, bold/italic, inline code, lists, task lists and quotes render in place and reveal their raw syntax under the cursor.
- bc64de3: Add the new-Note screen (`codemirror-obsidian-md/new-note`): folder picker with typed nested folders, name validation and Vault-relative path output.
- 5445d28: Add the `[[` picker: `pickerExtension({ candidates, resolver })` opens a list of the host's Notes when `[[` is typed, ranks them by the typed text (`rankCandidates`) and inserts a closed Wiki Link whose target the injectable resolver confirms (`wikiLinkTarget`).
- 9cf1688: Add the `lockedCommit` option to `createSaveLock`: start locked on a commit made before the editor opened, such as the commit that created the Note, until `isDeployed` reports it live.

### Patch Changes

- Updated dependencies [d6d97d3]
- Updated dependencies [1e70f39]
  - remark-obsidian-md@3.1.0
