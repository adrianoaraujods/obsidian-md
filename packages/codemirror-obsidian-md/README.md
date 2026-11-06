# codemirror-obsidian-md

A CodeMirror 6 editor for Obsidian Notes (in progress, see the project spec).

## Storage

The editor saves through a `Storage` object you pass in (`read`, `write`, `create`, `delete`, and an optional `lock` capability).

```ts
import type { Storage } from "codemirror-obsidian-md/storage";
import { createFilesystemStorage } from "codemirror-obsidian-md/storage/filesystem";

const storage = createFilesystemStorage({ root: "./content" });
```

Stale writes throw `StaleShaError`; creating an existing path throws `AlreadyExistsError`.

To test your own adapter, run the shared suite from a Vitest file:

```ts
import { runStorageContract } from "codemirror-obsidian-md/storage/contract";

runStorageContract("my adapter", async () => ({ storage: makeStorage() }));
```

### GitHub

`codemirror-obsidian-md/storage/github` (server-side only, it holds the write credential) commits through the Contents API. Each save, create and delete is one commit: `Update|Create|Delete <path>` plus `Edited-with` and `Edited-by` trailers built from the `editor` you pass (take it from the verified session, never from the client).

```ts
import { createGithubStorage } from "codemirror-obsidian-md/storage/github";

const storage = createGithubStorage({
  repo: "owner/name",
  branch: "main", // default: the repo's default branch
  vaultPath: "content", // default: the repo root
  // A fine-grained PAT, a GitHub App installation, or both (the App wins).
  credential: { token: process.env.GITHUB_TOKEN },
  editor: { name: session.user.name, login: session.user.login },
  deployedCommit: async () => buildSha, // adds `lock`; null when the host has no build commit
  // fetch and baseUrl are injectable (GitHub Enterprise, tests).
});
```

A stale SHA throws `StaleShaError` (with `newer.author` and `newer.time` when GitHub reports them) and an existing path throws `AlreadyExistsError`. `lock.isDeployed(commit)` is true when the deployed commit is identical to or ahead of `commit`.

### Browser adapter

Mount `createStorageHandler` from `codemirror-obsidian-md/storage/http` in a route handler (check the session inside `getStorage`; throw a `Response` to refuse). In the browser use `createStorageClient({ url: "/api/storage", lock: true })` from `codemirror-obsidian-md/storage/client`. It sends no token; the cookie authenticates and the token stays on the server.

### Fake Contents API

`createFakeContentsApi` from `codemirror-obsidian-md/storage/github-fake` is an in-memory GitHub with real SHA semantics (409 stale, 422 existing, commits, compare, App token minting). Pass its `fetch` and `baseUrl` to `createGithubStorage`, or wrap its `fetch` in an HTTP server for end-to-end tests. `externalWrite` simulates another person's commit.

## Editor

The document is the Note's raw Markdown, so saving never rewrites syntax you did not touch (CRLF, a missing trailing newline and odd Frontmatter included). Load it only on your edit route.

```ts
import { createEditor } from "codemirror-obsidian-md/editor";

const editor = createEditor({
  parent: document.querySelector("#editor")!,
  doc: markdown,
  providers: [], // Live Preview decoration providers, see below
  idleMs: 250, // re-parse after this much idle time
  onChange: (text) => markDirty(text !== markdown),
});

await storage.write(path, editor.getText(), sha); // the Save payload is exactly the document
editor.destroy();
```

Peer dependencies: `remark-obsidian-md` (the parser, ADR 0014), `@codemirror/state` and `@codemirror/view`.

### Editor Stylesheet

`createEditor` emits `cm-*` classes and styles nothing. For the Live Preview look, opt in with one import, like the plugin Stylesheet (ADR 0008):

```ts
import "codemirror-obsidian-md/styles.css";
import "remark-obsidian-md/styles.css"; // Highlights and Callouts, as on the Wiki
```

The Stylesheet covers headings (2em to 1em, bold, `#` markers dimmed on the cursor line), emphasis, inline code, quotes, bullets, task checkboxes, Wiki Links, Embeds, a Callout drawn as one box, the `[[` picker, and a cursor and selection that follow the theme. It has no dark-mode logic and does not read `prefers-color-scheme`: set the CSS variables from your own tokens, under `.dark` too. Every variable is optional and defaults to the inherited text colour or a neutral value.

```css
body {
  --obsidian-editor-fg: var(--foreground);
  --obsidian-editor-bg: var(--background);
  --obsidian-editor-cursor: var(--foreground);
  --obsidian-editor-selection: color-mix(in oklab, var(--primary) 30%, transparent);
  --obsidian-editor-popover-bg: var(--popover); /* the `[[` picker mounts on body */
}
```

Variables: `--obsidian-editor-` + `font`, `mono-font`, `line-height`, `fg`, `bg`, `cursor`, `selection`, `muted`, `accent`, `border`, `code-bg`, `popover-fg`, `popover-bg`, `popover-border`, `active-fg`, `active-bg`, `radius`, `heading-weight`, `h1-size` to `h6-size`. Define them on `body` or an ancestor that also contains the picker, which CodeMirror mounts outside the editor.

### How it works

1. `createNoteParser()` parses the Note with `unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkObsidianMd)` (parse only, no transform, so Comments keep their positions). Frontmatter is skipped. Tables, fenced code, math, Mermaid and reference footnotes (`PLAIN_SOURCE_TYPES`) yield no constructs, so they stay plain source.
2. Every other MDAST node becomes a `Construct { type, from, to, node }`.
3. The parse is re-run on the whole Note, debounced to idle. While you type, constructs and decorations are mapped through the edits.
4. Each `ConstructProvider` whose `types` include a construct's `type` is asked to decorate it.

### Extension points

Later Live Preview work adds to the core without changing it.

- **Decoration providers.** Implement `ConstructProvider` and pass it in `providers`, or register it from any extension with `constructProviders.of(provider)`:

  ```ts
  import { Decoration } from "@codemirror/view";
  import type { ConstructProvider } from "codemirror-obsidian-md/editor";

  const highlights: ConstructProvider = {
    name: "highlight",
    types: ["obsidianHighlight"], // MDAST node types: wikiLink, embed, obsidianComment, obsidianFootnote, blockquote, heading, ...
    decorate(construct, { revealed }) {
      if (revealed) return null; // cursor inside: show the raw syntax
      return Decoration.mark({ class: "obsidian-highlight" }).range(construct.from, construct.to);
    },
  };
  ```

  A provider returns one `Range<Decoration>`, an array of them, or nothing. Decorations may hide, replace or restyle text, never change it. Widgets are CodeMirror widgets reusing the plugin Stylesheet class names.
- **Cursor reveal.** `context.revealed` is `isRevealed(state, construct.from, construct.to)`. Call `isRevealed(state, from, to)` yourself for another range (a whole Callout, a line).
- **Parser.** Pass `parser: (text) => Construct[]` to replace the default, e.g. to add block-level scans such as `scanBlockIds`.
- **Extra extensions** (autocomplete picker, keymaps, save flow): pass `extensions`, or use `obsidianMd(doc, options)` to compose the core into your own `EditorState`. `reparse(view)` forces a re-parse; `constructsField` and `decorationsField` expose the state.

- **Callouts and Embeds.** `calloutEmbed({ types?, resolveAsset? })` (pass it in `extensions`) renders Callouts, Asset Embeds (images) and Note Embeds (chips) with the plugin Stylesheet class names; import `remark-obsidian-md/styles.css` for the colors and icons. The editor gets the `markdown-rendered` class (the Stylesheet above joins a Callout's lines into one box).

Decorations are rebuilt when a re-parse lands or the selection moves, and only mapped while typing.

Line breaks: the document always splits on `\n`, so a `\r` stays a character and positions equal text offsets. In a Note that is purely CRLF, Enter inserts `\r\n`.

### Multiple cursors

`createEditor` supports several cursors, drawn by CodeMirror (the native caret and selection are hidden, so the Stylesheet styles `.cm-cursor` and `.cm-selectionBackground`). Ctrl-click (Cmd-click on macOS) adds a cursor, Alt-drag selects a rectangle, Ctrl-Alt-Up/Down (Cmd-Alt on macOS) adds a cursor above or below, and Escape collapses to one. Typing and deleting apply to every cursor, and the `[[` picker stays closed while there are several.

### Editing Shortcuts

`editingShortcuts(options?)` (pass it in `extensions`, from `codemirror-obsidian-md/editor`) gives the editor Obsidian's editing feel. It is opt-in, runs at high precedence so it beats the stock `defaultKeymap`, applies at every cursor, and does nothing while an IME is composing. Mobile and soft keyboards are best effort.

Shipped so far: `Mod-b` and `Mod-i` toggle bold and italic. They detect either marker style (`**`/`__`, `*`/`_`), always wrap with `**` and `*`, leave the inner text selected, and insert an empty pair with the cursor inside when nothing is selected. Each range toggles by its own state.

`Mod-k` makes the selection `[selection]()` with the cursor in the parentheses, or inserts `[]()` with the cursor in the brackets when nothing is selected. While the editor handles `Mod-k` it stops the event from propagating, so a host's global `Mod-k` (the Fumadocs search dialog) does not also fire; outside the editor it is untouched. With `pasteUrlAsLink`, pasting a single http(s) URL over selected text makes `[text](url)` and leaves the cursor after it. Both apply per range and are skipped while composing.

```ts
editingShortcuts({
  // Keyed by command name, merged over the defaults. `false` disables one.
  keys: { bold: "Mod-j", italic: false },
  // Typing behaviors, each on by default.
  listContinuation: true,
  autoPair: true,
  wikiLinkAutoClose: true,
  pasteUrlAsLink: true,
  selectionWrap: true,
});
```

| Command      | Default     | Status      |
| ------------ | ----------- | ----------- |
| `bold`       | `Mod-b`     | shipped     |
| `italic`     | `Mod-i`     | shipped     |
| `link`       | `Mod-k`     | shipped     |
| `indent`     | `Mod-]`     | not yet     |
| `unindent`   | `Mod-[`     | not yet     |
| `toggleTask` | `Mod-Enter` | not yet     |

The flags are accepted now and take effect as each behavior ships. Which characters wrap or pair is fixed. `DEFAULT_EDITING_KEYS` exports the defaults.

### `[[` picker

`pickerExtension({ candidates, resolver?, maxResults? })` (pass it in `extensions`) opens a Note picker when `[[` is typed. `candidates` is `NoteCandidate[]` (`{ path, title?, aliases? }`) or a getter, ranked by `rankCandidates`. Choosing one inserts a closed Wiki Link; `wikiLinkTarget` uses the bare name when the injected `Resolver` (or, by default, name uniqueness) reaches that Note, else the path.

### Save flow

`createSaveFlow({ storage, path, content, sha, getText, confirm })` saves through a `Storage`. Pass `saveFlowExtension(flow)` in `extensions` (dirty tracking, Mod-s), call `flow.attachBeforeUnload()` for the leave-page warning and `mountConflictBanner(flow, parent)` for the conflict banner. `confirm(request)` is the host's dialog (`kind` is `save`, `overwrite` or `reload`; `request.message` is ready to show). A stale SHA commits nothing and sets `state.status` to `conflict`; `flow.overwrite()` refetches the base SHA and re-asks through `confirm`. `flow.subscribe` and `flow.onSaved` (with the `commit` for `Storage.lock`) are the hooks for lock handling.

### Lock after Save

`createSaveLock(flow, { storage, firstPollMs, intervalMs, timeoutMs })` listens to `flow.onSaved`. When `storage.lock` exists and the Save returned a `commit`, `lock.state.status` becomes `locked`; it polls `storage.lock.isDeployed(commit)` first after `firstPollMs` (1 minute), then every `intervalMs` (5 seconds), and returns to `unlocked` as soon as the deploy is live. After `timeoutMs` (5 minutes) the status is `timeout`: offer `lock.reload()` (Reload from GitHub, through the flow's `confirm`) and `lock.keepWaiting()`. If the Save returns no `commit`, `state.notice` is set once and nothing locks. Without `storage.lock`, and on a conflict, it never locks. Use `lock.subscribe` to disable the editor and `lock.dispose()` on unmount.

### Inline Live Preview

`inlineProviders` renders Wiki Links, Highlights (with Highlight Color), Comments, inline Footnotes and Block IDs, revealing the raw syntax under the cursor. Block IDs are not parse nodes, so wrap the parser with `blockIdParser()`:

```ts
createEditor({ parent, doc, providers: inlineProviders, parser: blockIdParser() });
```

## New Note screen

`codemirror-obsidian-md/new-note` is a framework-agnostic DOM component (the package has no React) plus the pure validation it uses. `Storage` cannot list files, so the host passes the Vault-relative paths of existing Notes.

```ts
import { createNewNoteScreen } from "codemirror-obsidian-md/new-note";

const screen = createNewNoteScreen({
  parent: document.querySelector("#new-note")!,
  existingPaths, // e.g. ["Index.md", "Geografia/Seba.md"]
  onCreate: (path) => storage.create(path, ""), // Vault-relative, ends in .md
  onCancel: () => history.back(),
});
```

The folder field offers existing folders and accepts a typed nested one; a folder exists only once a Note is created in it. `resolveNewNote({ folder, name, existing })` returns `{ ok: true, path }` or `{ ok: false, error }` (empty name, leading `/`, `..` segment, characters GitHub paths reject, existing path, case-only difference). `listFolders(paths)` derives the picker list.
