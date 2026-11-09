# codemirror-obsidian-md

## 0.3.0

### Minor Changes

- 3263a7d: `planReorganization` moves and renames folders: a staged change whose `from` is a folder carries everything in it, links and Embeds follow, and the commit counts the folder as one item.
- b402c84: `planReorganization` also rewrites the links a move or rename would break: Wiki Links, Embeds, Block References, Markdown links and Frontmatter links, keeping Alias, Subpath and path style. It takes the Notes' text and returns the `write` changes, a link count per Note and the URLs that change. `remark-obsidian-md/syntax` now exports `splitFrontmatter`.
- de6fcd4: Add `codemirror-obsidian-md/manager`: `planReorganization` turns staged moves and renames into one changeset with its commit subject and body, refusing invalid, colliding and case-clashing paths.
- c0fa816: The GitHub storage gains `changedSince(base)`, the Vault paths changed after a base commit, so a host can retry a changeset on the new base when a stale commit touched none of its files.
- 6a3bb07: Storage gains an atomic `commit(changeset, base, message?)` and `base()`: a `Changeset` of `Change`s (rename, write, delete) lands as one commit on the Vault's current base, so a reorganization is all or nothing. The GitHub storage uses the Git Data API and never forces the ref; the filesystem storage reports a tree hash as its base. A base that moved throws `StaleBaseError` (test with `isStaleBaseError`), and a rename onto a taken path throws `AlreadyExistsError`.

### Patch Changes

- 2ded56d: The GitHub storage's `commit` takes an optional subject and body, so a host can word the commit the way its confirm dialog showed it. The `Edited-with` and `Edited-by` trailer is still added by the adapter after them.
- 73a3446: The filesystem storage's `commit` keeps binary Assets byte for byte and removes the folders a commit leaves empty, as a Git commit would.
- Updated dependencies [b402c84]
  - remark-obsidian-md@3.2.0

## 0.2.0

### Minor Changes

- 9141db6: `editingShortcuts` now auto-pairs: typing `(`, `[`, `{`, `"`, `'` or `` ` `` with nothing selected inserts the closer too, a typed closer steps over an identical next character, and Backspace on an empty pair deletes both. Quotes do not pair after a word character, and `*`, `_`, `~`, `=` never pair. Typing `[[` gives `[[]]` and opens the `[[` picker. It applies at every cursor, is skipped during IME composition, and is switched off with `autoPair: false` (or only the `[[` close with `wikiLinkAutoClose: false`).
- 3ef3470: Add the opt-in `editingShortcuts(options?)` extension (from `codemirror-obsidian-md/editor`). `Mod-b` and `Mod-i` toggle bold and italic at every cursor, detecting `**`/`__` and `*`/`_`, and insert an empty pair when nothing is selected. Bold wraps with `**` and italic with `_`. Keys are rebound or disabled by command name (`bold`, `italic`, `link`, `indent`, `unindent`, `toggleTask`) and merge over Obsidian's defaults; nothing fires during IME composition.
- 092071a: `editingShortcuts` now handles links. `Mod-k` turns the selection into `[selection]()` with the cursor in the parentheses, or inserts `[]()` with the cursor in the brackets, and stops the event from reaching the page so a host's global `Mod-k` (such as the Fumadocs search) does not also fire. With `pasteUrlAsLink` (on by default), pasting an http(s) URL over selected text makes `[text](url)`. Both apply at every cursor, are skipped during IME composition, and `Mod-k` is rebound or disabled through `keys.link`.
- 4e4951d: `editingShortcuts` now wraps a selection when you type `*`, `_`, `` ` ``, `~`, `=`, `[`, `(`, `{`, `"` or `'` over it, leaving the inner text selected so a repeat nests (`*` twice gives `**x**`). Each wrap is its own undo step and applies at every cursor. Switch it off with `selectionWrap: false`; it is skipped during IME composition.
- 029e378: `editingShortcuts` now continues lists: Enter at the end of a bullet, numbered, task, quote or Callout line starts the next item with the same marker, Enter on an empty item and Backspace on an empty marker end the list, and fenced code is left alone. Switch it off with `listContinuation: false`.
- f9c93fb: `editingShortcuts` now indents lists and toggles tasks: Tab and Shift-Tab indent and unindent a list item and renumber numbered items (gated by `listContinuation`, and not intercepted outside a list or inside fenced code, so focus can leave the editor), `Mod-]` and `Mod-[` indent and unindent the selected lines, and `Mod-Enter` toggles a task. The `indent`, `unindent` and `toggleTask` keys are rebindable by name.
- d55a917: Add multi-cursor editing to `createEditor`: Alt-click (Option on macOS) adds a cursor, Shift-Alt-drag or a middle-mouse drag selects a rectangle, Ctrl-Alt-Up/Down adds a cursor above or below, and Escape collapses to one. The editor now draws its own cursor and selection, and the `[[` picker stays closed with several cursors.
- 0b0fe39: Add an opt-in editor Stylesheet, `codemirror-obsidian-md/styles.css`, driven by `--obsidian-editor-*` CSS variables with defaults. It styles headings (Obsidian's Live Preview scale, with the `#` markers dimmed on the cursor line), emphasis, code, quotes, lists, task checkboxes, Wiki Links, Embeds and the `[[` picker, draws a visible cursor and selection, keeps lines with widgets one line tall and renders a Callout as one box. The package holds no dark-mode logic: map the variables to your own tokens, under `.dark` too. `createEditor` and `calloutEmbed` no longer inject any theme. Providers now mark raw syntax revealed under the cursor with `cm-obsidian-*-raw` classes (Wiki Link, Highlight, Comment, inline Footnote, Block ID) and the heading `#` markers with `cm-obsidian-heading-mark`.

### Patch Changes

- 96c0149: Clicking a rendered Callout title now reveals its raw `> [!type] Title` line and puts the cursor in the title where you clicked, so the title can be edited.
- 92e67e2: Hide a multi-line (block) Comment in Live Preview and reveal its source when the cursor is inside it, like an inline Comment. Nodes nested in a Highlight now decorate at their own position, so a Wiki Link, bold or italic inside `==…==` renders correctly.
- Updated dependencies [9f41b51]
  - remark-obsidian-md@3.1.1

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
