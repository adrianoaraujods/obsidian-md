import { describe, expect, it } from "vitest";

import {
  movedPath,
  planReorganization,
  renamedPath,
} from "../../src/manager/index.js";

const files = [
  "Index.md",
  "Alpha.md",
  "Geografia/Sebá.md",
  "Geografia/Rios/Nilo.md",
  "Geografia/map.png",
];

function plan(changes: Parameters<typeof planReorganization>[0]["changes"]) {
  return planReorganization({ files, changes });
}

describe("planReorganization", () => {
  it("moves a Note into another folder as one rename and says Move", () => {
    const result = plan([
      {
        type: "move",
        from: "Alpha.md",
        to: movedPath("Alpha.md", "Geografia"),
      },
    ]);
    expect(result).toMatchObject({
      ok: true,
      changeset: [
        { type: "rename", from: "Alpha.md", to: "Geografia/Alpha.md" },
      ],
      subject: "Move Alpha.md",
    });
  });

  it("moves a Note to the Vault root with an empty folder", () => {
    expect(movedPath("Geografia/Sebá.md", "")).toBe("Sebá.md");
  });

  it("renames a Note, appending .md when the name has none, and says Rename", () => {
    expect(renamedPath("Geografia/Sebá.md", "Seba")).toBe("Geografia/Seba.md");
    expect(renamedPath("Geografia/Sebá.md", "Seba.md")).toBe(
      "Geografia/Seba.md",
    );
    const result = plan([
      { type: "move", from: "Geografia/Sebá.md", to: "Geografia/Seba.md" },
    ]);
    expect(result).toMatchObject({
      ok: true,
      changeset: [
        { type: "rename", from: "Geografia/Sebá.md", to: "Geografia/Seba.md" },
      ],
      subject: "Rename Geografia/Sebá.md",
    });
  });

  it("renames an Asset keeping the name as typed", () => {
    expect(renamedPath("Geografia/map.png", "mapa.png")).toBe(
      "Geografia/mapa.png",
    );
  });

  it("describes several changes as Reorganize <n> items with a body listing them", () => {
    const result = plan([
      { type: "move", from: "Alpha.md", to: "Geografia/Alpha.md" },
      { type: "move", from: "Index.md", to: "Home.md" },
    ]);
    expect(result).toMatchObject({ ok: true, subject: "Reorganize 2 items" });
    if (!result.ok) return;
    expect(result.body).toBe(
      "- Move Alpha.md → Geografia/Alpha.md\n- Rename Index.md → Home.md",
    );
  });

  it("chains changes on one Note into a single rename", () => {
    const result = plan([
      { type: "move", from: "Alpha.md", to: "Geografia/Alpha.md" },
      { type: "move", from: "Geografia/Alpha.md", to: "Geografia/Beta.md" },
    ]);
    expect(result).toMatchObject({
      ok: true,
      changeset: [
        { type: "rename", from: "Alpha.md", to: "Geografia/Beta.md" },
      ],
      subject: "Move Alpha.md",
    });
  });

  it("drops a Note moved back to where it started", () => {
    const result = plan([
      { type: "move", from: "Alpha.md", to: "Geografia/Alpha.md" },
      { type: "move", from: "Geografia/Alpha.md", to: "Alpha.md" },
    ]);
    expect(result).toMatchObject({ ok: true, changeset: [] });
  });

  it("orders renames so each target is free when its turn comes", () => {
    const result = plan([
      { type: "move", from: "Alpha.md", to: "Tmp.md" },
      { type: "move", from: "Index.md", to: "Alpha.md" },
    ]);
    if (!result.ok) throw new Error("expected ok");
    expect(result.changeset).toEqual([
      { type: "rename", from: "Alpha.md", to: "Tmp.md" },
      { type: "rename", from: "Index.md", to: "Alpha.md" },
    ]);
    const reversed = plan([
      { type: "move", from: "Index.md", to: "Home.md" },
      { type: "move", from: "Alpha.md", to: "Index.md" },
    ]);
    if (!reversed.ok) throw new Error("expected ok");
    expect(reversed.changeset[0]).toEqual({
      type: "rename",
      from: "Index.md",
      to: "Home.md",
    });
  });

  it("refuses two Notes swapping names, which no order of renames can apply", () => {
    const result = plan([
      { type: "move", from: "Alpha.md", to: "Tmp.md" },
      { type: "move", from: "Index.md", to: "Alpha.md" },
      { type: "move", from: "Tmp.md", to: "Index.md" },
    ]);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toMatch(/swap/i);
  });

  it("reports the resulting file list so the tree can update", () => {
    const result = plan([
      { type: "move", from: "Alpha.md", to: "Geografia/Alpha.md" },
    ]);
    if (!result.ok) throw new Error("expected ok");
    expect(result.files).toContain("Geografia/Alpha.md");
    expect(result.files).not.toContain("Alpha.md");
  });

  it.each([
    ["an empty name", "Geografia/.md", /name/i],
    ["a leading slash", "/Alpha.md", /start with a "\/"/],
    ["a .. segment", "../Alpha.md", /"\.\."/],
    ["a character GitHub rejects", "Geo:grafia/Alpha.md", /":"/],
    ["an empty folder segment", "Geografia//Alpha.md", /empty/],
  ])("refuses %s", (_label, to, message) => {
    const result = plan([{ type: "move", from: "Alpha.md", to }]);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toMatch(message);
  });

  it("refuses a move onto a path that is taken", () => {
    const result = plan([
      { type: "move", from: "Alpha.md", to: "Geografia/Sebá.md" },
    ]);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toMatch(/already exists/);
  });

  it("refuses a path that differs from another file only in case", () => {
    const result = plan([{ type: "move", from: "Alpha.md", to: "index.md" }]);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toMatch(/only in case/);
  });

  it("allows a case-only rename of the file itself", () => {
    const result = plan([{ type: "move", from: "Alpha.md", to: "ALPHA.md" }]);
    expect(result).toMatchObject({ ok: true, subject: "Rename Alpha.md" });
  });

  it("refuses a change to a file that is not in the Vault", () => {
    const result = plan([{ type: "move", from: "Nope.md", to: "Other.md" }]);
    expect(result).toMatchObject({ ok: false });
  });

  it("refuses to turn a Note into a non-Note or the reverse", () => {
    const result = plan([{ type: "move", from: "Alpha.md", to: "Alpha.txt" }]);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toMatch(/extension/);
  });
});
