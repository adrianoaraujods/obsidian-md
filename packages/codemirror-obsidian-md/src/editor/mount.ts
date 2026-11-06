import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

import { type ObsidianMdOptions, obsidianMd, reparse } from "./state.js";
import { livePreviewTheme } from "./theme.js";

export interface CreateEditorOptions extends ObsidianMdOptions {
  /** Element the editor mounts into. */
  parent: HTMLElement;
  /** The Note's raw Markdown. */
  doc: string;
  /** Extra extensions, appended after the core ones. */
  extensions?: readonly Extension[];
  /** Called with the full text after every document change. */
  onChange?: (text: string) => void;
}

export interface EditorHandle {
  readonly view: EditorView;
  /** The Save payload: exactly the document text, nothing re-serialized. */
  getText(): string;
  /** Re-parse now instead of waiting for idle. */
  reparse(): void;
  destroy(): void;
}

/** Mounts the editor on a Note's raw Markdown. */
export function createEditor(options: CreateEditorOptions): EditorHandle {
  const { parent, doc, onChange } = options;
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
        livePreviewTheme,
        obsidianMd(doc, options),
        onChange
          ? EditorView.updateListener.of((u) => {
              if (u.docChanged) onChange(u.state.doc.toString());
            })
          : [],
        options.extensions ?? [],
      ],
    }),
  });
  return {
    view,
    getText: () => view.state.doc.toString(),
    reparse: () => reparse(view),
    destroy: () => view.destroy(),
  };
}
