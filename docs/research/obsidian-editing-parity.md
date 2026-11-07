# Obsidian editing parity (spec #110, ticket #118)

Checked 2026-11-06 against Obsidian's official help and its forum. "UNVERIFIED" means no primary source could be found. Nothing here changed code; contradictions are reported for a decision.

## Findings

### (a) Multi-cursor gestures — CONTRADICTS what was built

Source: [Multiple cursors](https://obsidian.md/help/multiple-cursors) (official help; `help.obsidian.md` redirects here).

- Add a cursor: hold **Alt** (Windows/Linux) or **Option** (macOS) and click. Ctrl/Cmd-click is not documented.
- Column (rectangular) selection: **Shift+Alt** drag (Shift+Option on macOS), or hold the **middle mouse button** while dragging. Plain Alt-drag is not the documented gesture.
- Clear cursors: click without a modifier, or Escape.
- Forum confirmation: [No more multiple cursors with alt + mouse-drag](https://forum.obsidian.md/t/no-more-multiple-cursors-with-alt-mouse-drag/53215) (macOS, v1.1.9): a plain Alt-drag no longer works, "alt shift drag" does.

Resolved: the editor now matches. Alt-click (Option on macOS) adds a cursor (`clickAddsSelectionRange`), and Shift+Alt-drag or a middle-mouse drag selects a rectangle (`rectangularSelection` with an event filter). Ctrl/Cmd-click and plain Alt-drag no longer do either. Ctrl-Alt-Up/Down (CodeMirror's) is unchanged.

### (b) Multi-line list paste keeps indentation — UNVERIFIED, leaning "no"

No official source describes Obsidian's behavior. Forum reports say pasting a bullet list from other apps flattens nesting and adds extra spaces ([Pasting bullet list into Obsidian creates extra spaces](https://forum.obsidian.md/t/pasting-bullet-list-into-obsidian-creates-extra-spaces-reopened/53243)), and that pasting multi-line text into a sub-bullet breaks out of the list ([thread](https://forum.obsidian.md/t/pasting-multi-line-text-into-sub-bullet-breaks-out-of-bullets/105837)). These are user reports about rich-text sources, not about plain-text paste, and none is resolved. The paste therefore stays out of scope, and the README says the text is inserted as it is.

### (c) Default hotkeys

- Bold `Mod-b`, italic `Mod-i`: official, but only macOS is stated: [Editing shortcuts](https://obsidian.md/help/editing-shortcuts) lists Cmd+B and Cmd+I. Windows/Linux Ctrl+B / Ctrl+I: confirmed only by third-party cheat sheets. **Verified (macOS), otherwise third-party.**
- Insert link `Mod-k`: third-party cheat sheets only (e.g. [kapeli cheat sheet](https://kapeli.com/cheat_sheets/Obsidian.docset/Contents/Resources/Documents/index)); the official pages do not list it. **UNVERIFIED in primary sources.**
- Indent / unindent `Mod-]` / `Mod-[`: only one 2026 third-party cheat sheet ([fastshortcuts](https://fastshortcuts.com/shortcuts/obsidian/)); the official [Hotkeys](https://obsidian.md/help/hotkeys) page lists no defaults and points to Editing shortcuts, which does not list them. Tab / Shift-Tab are the documented-by-users list indent keys. **UNVERIFIED.**
- Toggle checkbox `Mod-Enter` — **CONTRADICTS what was built.** A forum answer says the default for _Toggle checkbox status_ is `Mod+L` ([Quick shortcut for checklists](https://forum.obsidian.md/t/quick-shortcut-for-checklists/74361/3)); a 2023 post says Ctrl+Enter became open-link-in-new-tab. Older cheat sheets still say Ctrl+Enter. Check Settings → Hotkeys in the Obsidian version you compare with. The built `toggleTask` default is `Mod-Enter`.
- Add cursor above / below: Obsidian has commands with those names, but a forum user reports them **unbound by default** ([Keyboard-only method to create multiple cursors?](https://forum.obsidian.md/t/keyboard-only-method-to-create-multiple-cursors/114836)). Other forum posts suggest Ctrl+Alt+Up/Down (Cmd+Option on macOS). Built: Mod-Alt-Up/Down (CodeMirror's documented keys). **UNVERIFIED as an Obsidian default.**

### (d) Typing a marker over a selection wraps it; typing again nests — PARTLY UNVERIFIED

- The only primary-ish evidence is an old forum thread (Obsidian 0.6.7): [The formatting of the selected text](https://forum.obsidian.md/t/the-formatting-of-the-selected-text/1493). Typing `*` over a selection wrapped it; typing `==` or `~~` replaced the selection instead. Nothing was said about `[`, `(`, quotes, `_`, `` ` ``, and no later fix is recorded.
- No official doc or changelog entry was found for wrapping, and none for nesting on a repeat. **UNVERIFIED** for every character except `*`. Current Obsidian may differ from the 0.6.7 report, which said `=` and `~` did not wrap while the build wraps them. Settle this in the manual checklist below.

## Contradictions with what was built (summary)

1. ~~Add-cursor click modifier~~ — fixed: Alt/Option-click.
2. ~~Column selection~~ — fixed: Shift+Alt-drag or middle-drag.
3. `toggleTask` default: Obsidian's default may be `Mod-L`, not `Mod-Enter`.
4. ~~Stale comment in `src/editor/multi-cursor.ts`~~ — fixed.

## Manual checklist

For pasting into the PR. Run each step in an Example's editor and in real Obsidian (Live Preview, a scratch note) side by side, on Windows/Linux and macOS where possible. `Mod` = Ctrl, or Cmd on macOS. Tick when both match; write down any difference.

### Formatting keys

- [ ] Select `word`, press `Mod-b`: it becomes `**word**` and stays selected. Press `Mod-b` again: back to `word`.
- [ ] Write `__word__`, select `word`, press `Mod-b`: the underscores are removed (no stacked markers).
- [ ] With nothing selected, press `Mod-b`: `****` with the cursor in the middle.
- [ ] Select `word`, press `Mod-i`: `*word*`. Write `_word_`, select `word`, press `Mod-i`: markers removed.
- [ ] With nothing selected, press `Mod-i`: `**` with the cursor in the middle.
- [ ] Select `text`, press `Mod-k`: `[text]()` with the cursor between the parentheses. With nothing selected: `[]()` with the cursor between the brackets.
- [ ] In the Example with the docs search (Fumadocs), press `Mod-k` inside the editor: search does NOT open. Click outside the editor and press `Mod-k`: search opens. (Departure.)
- [ ] Copy `https://example.com`, select `text`, paste: `[text](https://example.com)`.

### Lists and tasks

- [ ] `- item` Enter: new `- ` on the next line. Same for `* `, `+ `, `1. ` (next is `2. `), `1) `, `- [ ] ` (next is unchecked, even after `- [x] `), `> `, and a Callout (`> [!note]` then body lines).
- [ ] On an empty `- ` item press Enter: the marker is removed and the list ends.
- [ ] On an empty `- ` item press Backspace: the marker is removed.
- [ ] Enter in the middle of `- ab|cd`: splits into `- ab` and `- cd`.
- [ ] Inside a fenced code block, a line `- x` then Enter: no marker is added.
- [ ] Tab on `- item`: indented by one level. Shift-Tab: back. Compare the indent character (tab vs spaces) and the renumbering of a `1.` `2.` `3.` list when item 2 is indented.
- [ ] Tab on a plain paragraph line: Obsidian inserts a tab; the Example moves focus out of the editor. (Documented departure; confirm it is acceptable.)
- [ ] Shift-Tab on a top-level list item: note whether Obsidian also stays in the editor.
- [ ] `Mod-]` and `Mod-[` on a plain line and on a multi-line selection: lines shift one level. If Obsidian does nothing, the default key differs (see findings).
- [ ] `Mod-Enter` on `- [ ] a`: becomes `- [x] a`; again: back. On `- a`: becomes `- [ ] a`. On a plain line: nothing happens. If Obsidian does something else, check Settings → Hotkeys for "Toggle checkbox status" (likely `Mod-L`).
- [ ] Paste a multi-line nested list (`- a`, `\t- b`) onto an empty line: compare the indentation Obsidian keeps with the Example (the Example inserts the text as is).

### Selection Wrap

- [ ] Select `x`, type `*`: `*x*`, `x` still selected. Type `*` again: `**x**`.
- [ ] Repeat for `_`, `` ` ``, `~`, `=`: each wraps (Obsidian may replace the selection for `=` and `~`; record it).
- [ ] Select `x`, type `[`, then `(`, `{`, `"`, `'`: wraps with the matching closer, text stays selected.
- [ ] After one wrap, press Undo once: only that one marker is removed.

### Auto-pair

- [ ] Type `(`, `[`, `{`, `"`, `'`, `` ` `` with nothing selected: the closer appears and the cursor sits between.
- [ ] Type the closer right after: it steps over, no doubled closer.
- [ ] Type `()` then Backspace between them: both are deleted.
- [ ] Type `don't`: no stray `'` pair. Type `"hi"` with a word before the closing quote: no extra `"`.
- [ ] Type `*`, `_`, `~`, `=` with nothing selected: no pairing; `- ` list bullets and `snake_case` are undisturbed.
- [ ] Type `[[`: `[[]]` with the cursor inside, and the Note picker opens. Dismiss it, press `Ctrl-Space`: it reopens.

### Multiple cursors

- [ ] Alt-click (Option-click on macOS) in Obsidian adds a cursor. Alt-click in the Example adds a cursor too; Ctrl/Cmd-click does not.
- [ ] Rectangle: Shift+Alt-drag and middle-mouse drag select one in both; plain Alt-drag does not in the Example.
- [ ] Press the add-cursor-above / below keys in both (built: `Mod-Alt-Up/Down`; in Obsidian they may be unbound by default).
- [ ] With several cursors, type text, press Backspace, `Mod-b`, `Mod-k`, Enter in a list: every cursor changes.
- [ ] With several cursors, one in bold text and one in plain text, press `Mod-b`: each toggles by its own state.
- [ ] With several cursors, type `[[`: the Note picker stays closed.
- [ ] Press Escape: back to one cursor.

### Other

- [ ] IME (e.g. Japanese, or a dead-key accent): while composing, none of the above fires.
- [ ] Open a Note, do nothing, save: the file is not changed. After using shortcuts, the saved text equals what the editor shows.
- [ ] On a phone (best effort only): note anything broken, but it does not block the PR.
