import { describe, expect, it } from "vitest";

import { listFolders, resolveNewNote } from "../../src/new-note/validate.js";

const existing = ["Index.md", "Geografia/Sebá.md", "Geografia/Rios/Nilo.md"];

describe("listFolders", () => {
  it("lists every existing folder, parents included, sorted", () => {
    expect(listFolders(existing)).toEqual(["Geografia", "Geografia/Rios"]);
  });
});

describe("resolveNewNote", () => {
  it("produces a Vault-relative path with .md appended", () => {
    expect(
      resolveNewNote({ folder: "Geografia", name: "Lago", existing }),
    ).toEqual({ ok: true, path: "Geografia/Lago.md" });
  });

  it("keeps an explicit .md and supports the Vault root", () => {
    expect(resolveNewNote({ folder: "", name: "Inbox.md", existing })).toEqual({
      ok: true,
      path: "Inbox.md",
    });
  });

  it("accepts a newly typed nested folder", () => {
    expect(
      resolveNewNote({
        folder: "Mundo/Reinos/Norte",
        name: "Castelo",
        existing,
      }),
    ).toEqual({ ok: true, path: "Mundo/Reinos/Norte/Castelo.md" });
  });

  it("trims whitespace and a trailing slash on the folder", () => {
    expect(
      resolveNewNote({ folder: "Geografia/", name: "  Lago  ", existing }),
    ).toEqual({ ok: true, path: "Geografia/Lago.md" });
  });

  const rejects: [string, { folder: string; name: string }, RegExp][] = [
    ["empty name", { folder: "", name: "   " }, /enter a name/i],
    ["only extension", { folder: "", name: ".md" }, /enter a name/i],
    ["leading slash in name", { folder: "", name: "/x" }, /start with a "\/"/],
    [
      "leading slash in folder",
      { folder: "/a", name: "x" },
      /start with a "\/"/,
    ],
    ["dot-dot in name", { folder: "", name: "../x" }, /"\.\."/],
    ["dot-dot in folder", { folder: "a/../b", name: "x" }, /"\.\."/],
    ["empty segment", { folder: "a//b", name: "x" }, /empty/i],
    ["colon", { folder: "", name: "a:b" }, /not allowed/],
    ["asterisk", { folder: "", name: "a*b" }, /not allowed/],
    ["question mark", { folder: "", name: "a?b" }, /not allowed/],
    ["backslash", { folder: "", name: "a\\b" }, /not allowed/],
    ["pipe in folder", { folder: "a|b", name: "x" }, /not allowed/],
    ["control char", { folder: "", name: "a\u0007b" }, /not allowed/],
    ["existing path", { folder: "Geografia", name: "Sebá" }, /already exists/],
    [
      "case-only difference",
      { folder: "geografia", name: "sebá" },
      /differs only in case/,
    ],
  ];
  for (const [label, input, message] of rejects) {
    it(`rejects ${label}`, () => {
      const result = resolveNewNote({ ...input, existing });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(message);
    });
  }
});
