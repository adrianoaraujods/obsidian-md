import { type Extension, Prec } from "@codemirror/state";
import { type Command, type KeyBinding, keymap } from "@codemirror/view";

import { autoPair } from "./editing/auto-pair.js";
import { toggleBold, toggleItalic } from "./editing/emphasis.js";
import { listContinuation } from "./editing/list-continuation.js";
import {
  indentSelection,
  toggleTask,
  unindentSelection,
} from "./editing/list-indent.js";
import { selectionWrap } from "./editing/selection-wrap.js";

/** The Editing Shortcuts, by command name. */
export type EditingCommand =
  | "bold"
  | "italic"
  | "link"
  | "indent"
  | "unindent"
  | "toggleTask";

export interface EditingShortcutsOptions {
  /**
   * Key per command, in CodeMirror key syntax (`Mod-b`). Merged over the
   * Obsidian defaults; `false` disables a command.
   */
  keys?: Partial<Record<EditingCommand, string | false>>;
  /** Typing behaviors, each on by default. */
  listContinuation?: boolean;
  autoPair?: boolean;
  wikiLinkAutoClose?: boolean;
  pasteUrlAsLink?: boolean;
  selectionWrap?: boolean;
}

/** Obsidian's default keys. */
export const DEFAULT_EDITING_KEYS: Readonly<Record<EditingCommand, string>> = {
  bold: "Mod-b",
  italic: "Mod-i",
  link: "Mod-k",
  indent: "Mod-]",
  unindent: "Mod-[",
  toggleTask: "Mod-Enter",
};

/** Commands implemented so far; later tickets add the rest. */
const COMMANDS: Partial<Record<EditingCommand, Command>> = {
  bold: toggleBold,
  italic: toggleItalic,
  indent: indentSelection,
  unindent: unindentSelection,
  toggleTask,
};

/**
 * Obsidian's editing feel as one opt-in extension (ADR 0016). It runs at high
 * precedence so it beats the stock `defaultKeymap`, and every behavior is
 * skipped while an IME is composing.
 */
export function editingShortcuts(
  options: EditingShortcutsOptions = {},
): Extension {
  const keys = { ...DEFAULT_EDITING_KEYS, ...options.keys };
  const bindings: KeyBinding[] = [];
  for (const name of Object.keys(COMMANDS) as EditingCommand[]) {
    const key = keys[name];
    const command = COMMANDS[name];
    if (!key || !command) continue;
    bindings.push({
      key,
      // While composing, claim the key and do nothing, so a stock binding
      // (Mod-Enter inserts a line) cannot fire in the middle of an IME.
      run: (view) => composing(view) || command(view),
      preventDefault: true,
    });
  }
  const extensions: Extension[] = [keymap.of(bindings)];
  if (options.selectionWrap !== false)
    extensions.push(selectionWrap(composing));
  if (options.autoPair !== false)
    extensions.push(
      autoPair(composing, {
        wikiLinkAutoClose: options.wikiLinkAutoClose !== false,
      }),
    );
  return [
    Prec.high(extensions),
    options.listContinuation === false ? [] : listContinuation(),
  ];
}

function composing(view: { composing: boolean; compositionStarted: boolean }) {
  return view.composing || view.compositionStarted;
}
