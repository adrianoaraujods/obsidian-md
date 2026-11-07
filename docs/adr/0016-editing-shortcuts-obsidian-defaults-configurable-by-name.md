# Editing Shortcuts match Obsidian's defaults and are configurable by command name and behavior flag

`codemirror-obsidian-md` ships one opt-in extension that gives the editor Obsidian's editing feel: Editing Shortcuts, Selection Wrap, Auto-pair, list continuation and Tab indentation. It runs at high precedence so it beats the stock `defaultKeymap`. Each Example calls it with no options and gets Obsidian's defaults. We first meant the shortcuts to be hardcoded, but they live in a published package, so a consumer must be able to rebind them.

- **Keys** are overridden per named command (bold, italic, link, indent, unindent, toggle task). `false` disables one. Overrides merge over the defaults.
- **Typing behaviors** (list continuation, Auto-pair, `[[` auto-close, paste-URL-as-link, Selection Wrap) each have an on/off flag.
- **Not configurable**: which characters wrap a selection and which pairs close. These are Obsidian's behavior, not a preference.
- **Tab and Shift-Tab** are not named commands. They belong to list behavior, so the `listContinuation` flag switches them off together with Enter and Backspace; there is no separate key override or flag for them.
- Every behavior is skipped while an IME is composing.
- Every behavior is a plain text edit, so saving never rewrites syntax the reader did not touch (Live Preview).
- With several cursors, every edit applies per range, and the `[[` picker stays closed.

## Departures from Obsidian

- **Tab outside a list** falls through to the browser, so keyboard focus can leave the editor. Obsidian inserts a tab character.
- **`Mod-k` stops propagating** while the editor has focus. Fumadocs `RootProvider` opens its search dialog on `Mod-K` from a `window` listener, and Obsidian uses the same key to insert a link. The extension handles the collision itself, so any host with a global `Mod-k` is covered.

## Considered options

- **Hardcode the shortcuts**: simplest, and it was the first proposal. Rejected because a package consumer cannot fix a clash with their own page without forking.
- **Configure everything, including the wrap and pair character sets**: rejected because those sets are what makes the editor feel like Obsidian, and a consumer who changes them gets something else.
- **Bake the behavior into `createEditor`**: rejected, since consumers who don't want it would have to opt out of every part. An opt-in extension matches the opt-in Stylesheet ([ADR 0008](./0008-opt-in-class-scoped-stylesheet.md)).

## Consequences

The command names and flag names become public API and are hard to rename. Multi-cursor ships first, as its own issue under the same spec, and these behaviors assume it.
