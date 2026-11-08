import { describe, expect, it } from "vitest";
import {
  folderRefs,
  manageHref,
  ROOT_FOCUS,
  resolveFolder,
} from "./file-tree-targets";

const notes = {
  "/": "index.md",
  "/alpha": "Alpha.md",
  "/docs": "Docs/index.md",
  "/docs/guide": "Docs/Guides/Guide.md",
  "/docs/guides/setup": "Docs/Guides/Setup.md",
  "/misc/one": "Misc/One.md",
};

// What `source.getPageTree()` gives: a folder's name is its title.
const tree = [
  { type: "page", name: "Home", url: "/" },
  { type: "page", name: "Alpha", url: "/alpha" },
  {
    type: "folder",
    name: "Documentation",
    index: { type: "page", name: "Docs", url: "/docs" },
    children: [
      {
        type: "folder",
        name: "Guides",
        children: [
          { type: "page", name: "Guide", url: "/docs/guide" },
          { type: "page", name: "Setup", url: "/docs/guides/setup" },
        ],
      },
    ],
  },
  { type: "separator", name: "More" },
  {
    type: "folder",
    name: "Misc",
    children: [{ type: "page", name: "One", url: "/misc/one" }],
  },
];

describe("resolveFolder", () => {
  const refs = folderRefs(tree, notes);

  it("finds a top-level folder by its displayed name", () => {
    expect(resolveFolder(refs, ["Misc"])).toBe("Misc");
  });
  it("maps a displayed title to the folder's directory", () => {
    expect(resolveFolder(refs, ["Documentation"])).toBe("Docs");
  });
  it("follows the chain of names down to a nested folder", () => {
    expect(resolveFolder(refs, ["Documentation", "Guides"])).toBe(
      "Docs/Guides",
    );
  });
  it("ignores an icon's text before the name", () => {
    // Without an icon resolver Fumadocs prints a folder's `icon` as text.
    expect(resolveFolder(refs, ["listDocumentation", "Guides"])).toBe(
      "Docs/Guides",
    );
  });
  it("prefers the exact name over one it merely ends with", () => {
    const similar = [
      { name: "Notes", path: "Notes", children: [] },
      { name: "Old Notes", path: "Old Notes", children: [] },
    ];
    expect(resolveFolder(similar, ["Old Notes"])).toBe("Old Notes");
    expect(resolveFolder(similar, ["Notes"])).toBe("Notes");
  });
  it("is undefined for a name the tree does not have", () => {
    expect(resolveFolder(refs, ["Nope"])).toBeUndefined();
    expect(resolveFolder(refs, ["Misc", "Guides"])).toBeUndefined();
  });
});

describe("manageHref", () => {
  it("opens the Manager on the item", () => {
    expect(manageHref("Docs/Guides/Setup.md")).toBe(
      "/manage?focus=Docs%2FGuides%2FSetup.md",
    );
  });
  it("names the root of the File Tree with ROOT_FOCUS", () => {
    expect(manageHref(ROOT_FOCUS)).toBe("/manage?focus=%2F");
  });
});
