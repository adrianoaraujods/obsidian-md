import { describe, expect, it } from "vitest";

import { planReorganization } from "../../src/manager/index.js";

/** Rename/move one file in a Vault of Notes and return what the commit writes. */
function run(
  notes: Record<string, string>,
  from: string,
  to: string,
  extra: string[] = [],
) {
  const files = [...Object.keys(notes), ...extra];
  const plan = planReorganization({
    files,
    notes,
    changes: [{ type: "move", from, to }],
  });
  if (!plan.ok) throw new Error(plan.error);
  const writes = new Map(
    plan.changeset.flatMap((c) =>
      c.type === "write" ? [[c.path, c.content]] : [],
    ),
  );
  return { plan, writes };
}

const link = (body: string) => `Intro\n\n${body}\n`;

describe("Wiki Links on rename", () => {
  it("rewrites a bare-name link to the new name", () => {
    const { writes, plan } = run(
      { "Target.md": "", "Source.md": link("See [[Target]] here.") },
      "Target.md",
      "Renamed.md",
    );
    expect(writes.get("Source.md")).toBe(link("See [[Renamed]] here."));
    expect(plan.rewrites).toEqual([
      expect.objectContaining({ path: "Source.md", links: 1 }),
    ]);
  });

  it("keeps the Alias and the Subpath", () => {
    const { writes } = run(
      {
        "Target.md": "",
        "Source.md": link(
          "[[Target#Heading|shown]] [[Target#^blk]] [[Target|x]]",
        ),
      },
      "Target.md",
      "New.md",
    );
    expect(writes.get("Source.md")).toBe(
      link("[[New#Heading|shown]] [[New#^blk]] [[New|x]]"),
    );
  });

  it("keeps the .md extension when the author wrote it", () => {
    const { writes } = run(
      { "Target.md": "", "Source.md": link("[[Target.md]]") },
      "Target.md",
      "New.md",
    );
    expect(writes.get("Source.md")).toBe(link("[[New.md]]"));
  });
});

describe("Embeds and Block References", () => {
  it("rewrites an Embed of a Note and of an Asset, keeping the size", () => {
    const { writes } = run(
      {
        "Target.md": "",
        "Source.md": link("![[Target]] ![[Target#Heading]] ![[pic.png|200]]"),
      },
      "pic.png",
      "photo.png",
      ["pic.png"],
    );
    expect(writes.get("Source.md")).toBe(
      link("![[Target]] ![[Target#Heading]] ![[photo.png|200]]"),
    );
  });

  it("rewrites a Block Reference and an Embed of a block", () => {
    const { writes } = run(
      {
        "Target.md": "x ^id",
        "Source.md": link("[[Target#^id]] ![[Target#^id]]"),
      },
      "Target.md",
      "Other.md",
    );
    expect(writes.get("Source.md")).toBe(link("[[Other#^id]] ![[Other#^id]]"));
  });
});

describe("path style", () => {
  it("keeps a folder path a folder path", () => {
    const { writes } = run(
      {
        "Docs/Target.md": "",
        "Source.md": link("[[Docs/Target]] [[Docs/Target#h|a]]"),
      },
      "Docs/Target.md",
      "Docs/New.md",
    );
    expect(writes.get("Source.md")).toBe(link("[[Docs/New]] [[Docs/New#h|a]]"));
  });

  it("rewrites a folder path when the Note moves, and leaves a bare name alone", () => {
    const { writes } = run(
      {
        "Docs/Target.md": "",
        "Source.md": link("[[Docs/Target]] and [[Target]]"),
      },
      "Docs/Target.md",
      "Other/Target.md",
    );
    expect(writes.get("Source.md")).toBe(
      link("[[Other/Target]] and [[Target]]"),
    );
  });

  it("leaves name-only links alone on a plain move", () => {
    const { plan, writes } = run(
      {
        "Target.md": "",
        "Source.md": link("[[Target]] ![[Target]] [[Target#h]]"),
      },
      "Target.md",
      "Docs/Target.md",
    );
    expect(writes.size).toBe(0);
    expect(plan.rewrites).toEqual([]);
  });

  it("rewrites a bare name that a move makes ambiguous to the full path", () => {
    const { writes } = run(
      {
        "A/Same.md": "",
        "B/Same.md": "",
        "Source.md": link("[[Same]]"),
      },
      "A/Same.md",
      "C/Deep/Same.md",
    );
    // A/Same.md was the winner by sort order at equal depth; after the move B/Same.md wins.
    expect(writes.get("Source.md")).toBe(link("[[C/Deep/Same]]"));
  });

  it("rewrites a bare name when the move puts a shallower Note of the same name in front", () => {
    const { writes } = run(
      {
        "Same.md": "",
        "Docs/Same.md": "",
        "Source.md": link("[[Docs/Same]] [[Same]]"),
      },
      "Same.md",
      "Zed/Same.md",
    );
    // `Same` now resolves to Docs/Same.md; it used to mean the root Note.
    expect(writes.get("Source.md")).toBe(link("[[Docs/Same]] [[Zed/Same]]"));
  });

  it("leaves a link that goes through an Alias alone", () => {
    const { writes } = run(
      {
        "Target.md": "---\naliases: [Nick]\n---\n",
        "Source.md": link("[[Nick]]"),
      },
      "Target.md",
      "Docs/New.md",
    );
    expect(writes.size).toBe(0);
  });

  it("leaves unresolved links alone", () => {
    const { writes } = run(
      {
        "Target.md": "",
        "Source.md": link("[[Nowhere]] [[#Here]] [[Target]]"),
      },
      "Target.md",
      "New.md",
    );
    expect(writes.get("Source.md")).toBe(link("[[Nowhere]] [[#Here]] [[New]]"));
  });
});

describe("Markdown links", () => {
  it("rewrites inline links, images and definitions, keeping the fragment and title", () => {
    const { writes } = run(
      {
        "Target.md": "",
        "Source.md": link(
          '[a](Target.md#Heading) [b](Target.md "title") ![c](pic.png)\n\n[ref]: Target.md',
        ),
      },
      "Target.md",
      "New.md",
    );
    expect(writes.get("Source.md")).toBe(
      link(
        '[a](New.md#Heading) [b](New.md "title") ![c](pic.png)\n\n[ref]: New.md',
      ),
    );
  });

  it("encodes spaces the way the author did", () => {
    const { writes } = run(
      {
        "Target.md": "",
        "Source.md": link("[a](Target.md) [b](<Target.md>)"),
      },
      "Target.md",
      "New Name.md",
    );
    expect(writes.get("Source.md")).toBe(
      link("[a](New%20Name.md) [b](<New Name.md>)"),
    );
  });

  it("understands encoded paths", () => {
    const { writes } = run(
      { "My Note.md": "", "Source.md": link("[a](My%20Note.md#h)") },
      "My Note.md",
      "Docs/Other.md",
    );
    // A bare name stays bare, and the rename is spelled the way the author encoded it.
    expect(writes.get("Source.md")).toBe(link("[a](Other.md#h)"));
  });

  it("rewrites a folder path in a Markdown link", () => {
    const { writes } = run(
      { "Docs/My Note.md": "", "Source.md": link("[a](Docs/My%20Note.md#h)") },
      "Docs/My Note.md",
      "Lib/My Note.md",
    );
    expect(writes.get("Source.md")).toBe(link("[a](Lib/My%20Note.md#h)"));
  });

  it("leaves external links, anchors and mail links alone", () => {
    const { writes } = run(
      {
        "Target.md": "",
        "Source.md": link(
          "[a](https://x.dev/Target.md) [b](#Target) [c](mailto:a@b.c)",
        ),
      },
      "Target.md",
      "New.md",
    );
    expect(writes.size).toBe(0);
  });

  it("keeps relative links relative, including when the linking Note moves", () => {
    const { writes } = run(
      {
        "Docs/Source.md": link("[a](./Target.md) [b](../Other.md)"),
        "Docs/Target.md": "",
        "Other.md": "",
      },
      "Docs/Source.md",
      "Docs/Deep/Source.md",
    );
    expect(writes.get("Docs/Deep/Source.md")).toBe(
      link("[a](../Target.md) [b](../../Other.md)"),
    );
  });
});

describe("Frontmatter links", () => {
  it("rewrites quoted and listed Wiki Links in Properties", () => {
    const fm = (a: string, b: string) =>
      `---\nup: "[[${a}]]"\nrelated:\n  - "[[${b}|alias]]"\ntags: [x]\n---\nBody\n`;
    const { writes } = run(
      { "Target.md": "", "Source.md": fm("Target", "Target#h") },
      "Target.md",
      "New.md",
    );
    expect(writes.get("Source.md")).toBe(fm("New", "New#h"));
  });
});

describe("where links hide", () => {
  it("skips code, rewrites tables, highlights and footnotes", () => {
    const body = (n: string) =>
      [
        `\`[[${n}]]\``,
        "```",
        `[[${n}]]`,
        "```",
        "",
        `| a | b |`,
        `|---|---|`,
        `| [[${n}\\|x]] | ![[${n}]] |`,
        "",
        `==[[${n}]]== and ^[see [[${n}]]]`,
      ].join("\n");
    const { writes } = run(
      { "Target.md": "", "Source.md": link(body("Target")) },
      "Target.md",
      "New.md",
    );
    const expected = body("Target")
      .replace("| [[Target\\|x]] | ![[Target]] |", "| [[New\\|x]] | ![[New]] |")
      .replace(
        "==[[Target]]== and ^[see [[Target]]]",
        "==[[New]]== and ^[see [[New]]]",
      );
    expect(writes.get("Source.md")).toBe(link(expected));
  });

  it("rewrites links in the renamed Note itself and writes it at its new path", () => {
    const { plan, writes } = run(
      { "Target.md": "I am [[Target]].\n" },
      "Target.md",
      "New.md",
    );
    expect(writes.get("New.md")).toBe("I am [[New]].\n");
    expect(plan.changeset[0]).toEqual({
      type: "rename",
      from: "Target.md",
      to: "New.md",
    });
  });

  it("moves a whole folder: links into it follow, links inside it stay", () => {
    const notes = {
      "Docs/A.md": "[[B]] [[Docs/B]]\n",
      "Docs/B.md": "",
      "Source.md": "[[Docs/B]] [[B]] [[A]]\n",
    };
    const plan = planReorganization({
      files: Object.keys(notes),
      notes,
      changes: [
        { type: "move", from: "Docs/A.md", to: "Lib/A.md" },
        { type: "move", from: "Docs/B.md", to: "Lib/B.md" },
      ],
    });
    if (!plan.ok) throw new Error(plan.error);
    const writes = new Map(
      plan.changeset.flatMap((c) =>
        c.type === "write" ? [[c.path, c.content]] : [],
      ),
    );
    expect(writes.get("Lib/A.md")).toBe("[[B]] [[Lib/B]]\n");
    expect(writes.get("Source.md")).toBe("[[Lib/B]] [[B]] [[A]]\n");
  });
});

describe("URLs", () => {
  it("lists the Note URLs that change", () => {
    const { plan } = run(
      { "Geografia/Sebá.md": "", "Other.md": "" },
      "Geografia/Sebá.md",
      "Lugares/Seba.md",
    );
    expect(plan.urls).toEqual([
      { path: "Lugares/Seba.md", from: "/geografia/seba", to: "/lugares/seba" },
    ]);
  });

  it("lists no URL for an Asset", () => {
    const { plan } = run({ "A.md": "" }, "pic.png", "Docs/pic.png", [
      "pic.png",
    ]);
    expect(plan.urls).toEqual([]);
  });
});
