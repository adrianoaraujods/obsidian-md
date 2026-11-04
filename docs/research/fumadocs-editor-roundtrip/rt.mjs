import { parseMdxToDoc } from "@fumadocs-editor/core/parse";
import { serializeDocToMdx } from "@fumadocs-editor/core/serialize";
import { createSyntax, admonitionSpec } from "@fumadocs-editor/core";
const cases = {
 "wikilink": "See [[My Note]] here.\n",
 "wikilink alias+subpath": "See [[My Note#Heading|alias]] and [[N#^blk]].\n",
 "embed": "![[Note]]\n\n![[img.png|200]]\n",
 "highlight": "This is ==highlighted== text.\n",
 "comment inline": "Text %%hidden%% text.\n",
 "comment block": "%%\nhidden block\n%%\n",
 "inline footnote": "Text^[inline note] more.\n",
 "ref footnote": "Text[^1] more.\n\n[^1]: The note.\n",
 "block id": "A paragraph. ^abc123\n",
 "callout": "> [!tip] Title\n> Body text\n",
 "callout fold": "> [!note]- Folded\n> Body\n",
 "frontmatter": "---\ntitle: X\ntags: [a, b]\n---\n\nBody\n",
 "tag": "A #tag here and #nested/tag.\n",
 "task list": "- [x] done\n- [ ] todo\n",
 "table w/ wikilink": "| a | b |\n| - | - |\n| [[X]] | y |\n",
 "math inline": "Inline $a^2$ math.\n",
 "math block": "$$\nE=mc^2\n$$\n",
 "mermaid": "```mermaid\ngraph TD; A-->B\n```\n",
 "html comment": "<!-- c -->\n\ntext\n",
 "curly braces": "Use {braces} in text.\n",
 "lt sign": "a < b and 1<2\n",
 "raw html": "<div>hi</div>\n",
 "br tag": "line<br>break\n",
 "autolink": "<https://example.com>\n",
 "escaped pipe wikilink in table": "| a |\n| - |\n| [[X\\|Y]] |\n",
 "non-ASCII wikilink": "[[Geografia/Localizações/Sebá]]\n",
 "dollar amounts": "costs $5 and $10\n",
 "underscore/asterisk text": "snake_case_word and 2*3*4\n",
};
function walk(n, s=new Set()){ s.add(n.type); (n.content||[]).forEach(c=>walk(c,s)); (n.marks||[]).forEach(m=>s.add("mark:"+m.type)); return s;}
for (const syn of [["default", createSyntax()], ["math+directives", createSyntax([admonitionSpec], {math:true})]]) {
 console.log("\n=== syntax:", syn[0]);
 for (const [k,src] of Object.entries(cases)) {
  let r = {k};
  try {
   const {doc, snapshot} = parseMdxToDoc(src, syn[1]);
   r.types = [...walk(doc)].filter(t=>t!=="doc").join(",");
   r.verbatim = serializeDocToMdx(doc, snapshot, syn[1]) === src ? "identical" : "CHANGED";
   const norm = serializeDocToMdx(doc, undefined, syn[1]);
   r.normalized = norm === src ? "identical" : norm;
  } catch(e){ r.error = String(e.message).split("\n")[0]; }
  console.log(JSON.stringify(r));
 }
}
