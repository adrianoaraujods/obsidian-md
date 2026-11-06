import type { Range } from "@codemirror/state";
import { Decoration, type EditorView, WidgetType } from "@codemirror/view";

import { isRevealed } from "../cursor.js";
import type { ConstructProvider } from "../types.js";

class BulletWidget extends WidgetType {
  eq(): boolean {
    return true;
  }
  toDOM(): HTMLElement {
    const el = document.createElement("span");
    el.className = "cm-obsidian-bullet";
    el.textContent = "•";
    return el;
  }
}

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }
  eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked;
  }
  toDOM(view: EditorView): HTMLElement {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "cm-obsidian-checkbox";
    box.checked = this.checked;
    box.addEventListener("mousedown", (event) => {
      event.preventDefault();
      // Toggling edits the status character inside `[ ]`, like clicking in Obsidian.
      const start = view.posAtDOM(box);
      const open = view.state.sliceDoc(start, start + 16).indexOf("[");
      if (open < 0) return;
      const pos = start + open + 1;
      const current = view.state.sliceDoc(pos, pos + 1);
      if (current !== " " && current !== "x" && current !== "X") return;
      view.dispatch({
        changes: {
          from: pos,
          to: pos + 1,
          insert: current === " " ? "x" : " ",
        },
      });
    });
    return box;
  }
  ignoreEvent(): boolean {
    return true;
  }
}

const bullet = Decoration.replace({ widget: new BulletWidget() });
const hide = Decoration.replace({});

const mark = (cls: string, from: number, to: number) =>
  Decoration.mark({ class: cls }).range(from, to);
const line = (cls: string, at: number) =>
  Decoration.line({ class: cls }).range(at);

/**
 * Live Preview for standard Markdown: headings, emphasis, inline code, lists,
 * task lists and quotes. Each renders in place while the cursor is outside it
 * and reveals its raw syntax while the cursor touches it.
 */
export const markdownProvider: ConstructProvider = {
  name: "markdown",
  types: [
    "heading",
    "strong",
    "emphasis",
    "inlineCode",
    "listItem",
    "blockquote",
  ],
  decorate(construct, { state, revealed }) {
    const { from, to } = construct;
    const doc = state.doc;
    const out: Range<Decoration>[] = [];

    switch (construct.type) {
      case "heading": {
        const depth = (construct.node as { depth: number }).depth;
        out.push(
          line(
            `cm-obsidian-heading cm-obsidian-h${depth}`,
            doc.lineAt(from).from,
          ),
        );
        const marker = /^#{1,6}[ \t]+/.exec(doc.sliceString(from, to));
        if (marker && !revealed) {
          out.push(hide.range(from, from + marker[0].length));
        }
        break;
      }
      case "strong":
      case "emphasis": {
        const n = construct.type === "strong" ? 2 : 1;
        if (to - from <= 2 * n) return null;
        out.push(
          mark(
            construct.type === "strong"
              ? "cm-obsidian-strong"
              : "cm-obsidian-em",
            from + n,
            to - n,
          ),
        );
        if (!revealed) {
          out.push(hide.range(from, from + n), hide.range(to - n, to));
        }
        break;
      }
      case "inlineCode": {
        const n = /^`+/.exec(doc.sliceString(from, to))?.[0].length ?? 0;
        if (n === 0 || to - from <= 2 * n) return null;
        out.push(mark("cm-obsidian-code", from + n, to - n));
        if (!revealed) {
          out.push(hide.range(from, from + n), hide.range(to - n, to));
        }
        break;
      }
      case "listItem": {
        // Only the item's first line reveals, not its nested items.
        const first = doc.lineAt(from);
        const open = !isRevealed(state, from, first.to);
        const text = doc.sliceString(from, first.to);
        const checked = (construct.node as { checked?: boolean | null })
          .checked;
        const task = /^[-*+][ \t]+\[[ xX]\][ \t]/.exec(text);
        out.push(line("cm-obsidian-li", first.from));
        if (typeof checked === "boolean" && task) {
          if (checked) out.push(line("cm-obsidian-task-done", first.from));
          if (open) {
            out.push(
              Decoration.replace({ widget: new CheckboxWidget(checked) }).range(
                from,
                from + task[0].length,
              ),
            );
          }
        } else if (open && /^[-*+][ \t]/.test(text)) {
          out.push(bullet.range(from, from + 1));
        }
        break;
      }
      case "blockquote": {
        const first = doc.lineAt(from);
        const last = doc.lineAt(to);
        // A nested quote leaves marker hiding to its outermost quote.
        const nested = doc.sliceString(first.from, from).includes(">");
        for (let n = first.number; n <= last.number; n++) {
          const l = doc.line(n);
          out.push(line("cm-obsidian-quote", l.from));
          if (revealed || nested) continue;
          const start = n === first.number ? from : l.from;
          const marker = /^[ \t]*(?:>[ \t]?)+/.exec(
            doc.sliceString(start, l.to),
          );
          if (marker) out.push(hide.range(start, start + marker[0].length));
        }
        break;
      }
    }
    return out;
  },
};
