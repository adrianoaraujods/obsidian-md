// PROTOTYPE: CodeMirror 6 Live Preview. Regex-based, no tests, no polish.
import { EditorState, StateField, RangeSetBuilder } from "@codemirror/state";
import { EditorView, Decoration, WidgetType, keymap, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { autocompletion } from "@codemirror/autocomplete";

const VAULT = ["Sebá", "Geografia/Localizações", "Home", "Ideas/Live Preview", "Callouts"];

const DOC = `# Live Preview feel test

Wiki Links: [[Home]], [[Sebá#History|a city]], [[Missing note]] and an embed ![[map.png|200]].
Type \`[[\` below to try the picker: 

Highlights: ==plain== and ==🔴 red one== and ==🟢 green one== with **bold** and *italic*.

Comment: before %%this is a comment%% after.

> [!tip] Callout title
> Body line with a [[Home]] link and ==highlight==.
> Second line.

> [!warning]
> Untitled callout.

## Block id and plain quote

A paragraph with a block id. ^para1

> just a normal quote
> not a callout

Things Obsidian users write that MDX chokes on: a < b, <br>, <!-- html comment -->, <https://example.com>.
`;

const touches = (sel, from, to) => sel.ranges.some((r) => r.from <= to && r.to >= from);

class Text extends WidgetType {
  constructor(text, cls, onclick) { super(); this.text = text; this.cls = cls; this.onclick = onclick; }
  eq(o) { return o.text === this.text && o.cls === this.cls; }
  toDOM(view) {
    const s = document.createElement("span");
    s.className = this.cls; s.textContent = this.text;
    s.onmousedown = (e) => { e.preventDefault(); this.onclick?.(view, e); };
    return s;
  }
  ignoreEvent() { return false; }
}

function build(state) {
  const sel = state.selection, doc = state.doc, out = [];
  const add = (from, to, deco) => out.push(deco.range(from, to));
  const hide = (f, t) => f < t && add(f, t, Decoration.replace({}));

  // callout blocks first (so we know which lines belong to one)
  const calloutLines = new Map();
  for (let n = 1; n <= doc.lines; n++) {
    const m = /^> \[!(\w+)\]([+-])?\s*(.*)$/.exec(doc.line(n).text);
    if (!m) continue;
    let end = n;
    while (end + 1 <= doc.lines && /^>/.test(doc.line(end + 1).text)) end++;
    const from = doc.line(n).from, to = doc.line(end).to;
    const active = touches(sel, from, to);
    for (let k = n; k <= end; k++) calloutLines.set(k, { type: m[1].toLowerCase(), first: k === n, last: k === end, active, title: m[3] || m[1][0].toUpperCase() + m[1].slice(1), start: n });
  }

  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n), t = line.text, base = line.from;
    const co = calloutLines.get(n);
    if (co) {
      add(base, base, Decoration.line({ class: `lp-co lp-co-${co.type} ${co.first ? "lp-co-first" : ""} ${co.last ? "lp-co-last" : ""}` }));
      if (!co.active) {
        if (co.first) {
          add(base, line.to, Decoration.replace({ widget: new Text(co.title, "lp-co-title", (v) => v.dispatch({ selection: { anchor: line.to } })) }));
        } else {
          const p = /^> ?/.exec(t)[0].length; hide(base, base + p);
        }
      }
    } else if (/^> /.test(t) && !touches(sel, base, line.to)) {
      add(base, base, Decoration.line({ attributes: { style: "border-left:3px solid #8886;padding-left:12px;color:var(--dim)" } }));
      hide(base, base + 2);
    }
    const h = /^(#{1,3}) /.exec(t);
    if (h) {
      add(base, base, Decoration.line({ class: `lp-h${h[1].length}` }));
      if (!touches(sel, base, line.to)) hide(base, base + h[0].length);
    }
    const scan = (re, fn) => { re.lastIndex = 0; let m; while ((m = re.exec(t))) fn(m, base + m.index, base + m.index + m[0].length); };
    // wiki links and embeds
    scan(/(!?)\[\[([^\]|#]*)(#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (m, f, to) => {
      const label = m[4] ?? (m[1] ? m[2] + (m[3] ?? "") : m[2] + (m[3] ?? ""));
      if (touches(sel, f, to)) add(f, to, Decoration.mark({ class: "lp-raw" }));
      else add(f, to, Decoration.replace({ widget: new Text((m[1] ? "🖼 " : "") + label, "lp-wl" + (VAULT.includes(m[2]) || m[1] ? "" : " unresolved"), (v) => v.dispatch({ selection: { anchor: f + 2 } })) }));
    });
    scan(/==(🔴|🟢|🔵|🟡)?\s?(.+?)==/g, (m, f, to) => {
      const cls = "lp-hl " + ({ "🔴": "lp-hl-red", "🟢": "lp-hl-green", "🔵": "lp-hl-blue" }[m[1]] ?? "");
      if (touches(sel, f, to)) { add(f, to, Decoration.mark({ class: cls })); return; }
      const open = 2 + (m[1] ? m[0].slice(2).indexOf(m[2]) : 0);
      hide(f, f + open); add(f + open, to - 2, Decoration.mark({ class: cls })); hide(to - 2, to);
    });
    scan(/%%(.+?)%%/g, (m, f, to) => add(f, to, Decoration.mark({ class: "lp-cm" })));
    scan(/\*\*(.+?)\*\*/g, (m, f, to) => {
      if (touches(sel, f, to)) return; hide(f, f + 2); add(f + 2, to - 2, Decoration.mark({ class: "lp-b" })); hide(to - 2, to);
    });
    scan(/(?<![*\w])\*([^*\s][^*]*?)\*(?!\*)/g, (m, f, to) => {
      if (touches(sel, f, to)) return; hide(f, f + 1); add(f + 1, to - 1, Decoration.mark({ class: "lp-i" })); hide(to - 1, to);
    });
    scan(/\^[\w-]+$/g, (m, f, to) => add(f, to, Decoration.mark({ class: "lp-id" })));
    scan(/`[^`]+`/g, (m, f, to) => add(f, to, Decoration.mark({ class: "lp-code" })));
  }
  return Decoration.set(out, true);
}

const live = StateField.define({
  create: build,
  update: (v, tr) => (tr.docChanged || tr.selection ? build(tr.state) : v),
  provide: (f) => EditorView.decorations.from(f),
});

const wikiComplete = (ctx) => {
  const m = ctx.matchBefore(/\[\[[^\]]*/);
  if (!m) return null;
  return { from: m.from + 2, options: VAULT.map((l) => ({ label: l, apply: l + "]]" })), validFor: /^[^\]]*$/ };
};

const view = new EditorView({
  parent: document.getElementById("ed"),
  state: EditorState.create({
    doc: DOC,
    extensions: [history(), drawSelection(), EditorView.lineWrapping, keymap.of([...defaultKeymap, ...historyKeymap]), live,
      autocompletion({ override: [wikiComplete] })],
  }),
});
window.view = view;
document.getElementById("dump").onclick = (e) => {
  e.preventDefault();
  const r = document.getElementById("raw"); r.hidden = !r.hidden; r.textContent = view.state.doc.toString();
};
