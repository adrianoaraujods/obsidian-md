import { describe, expect, it } from "vitest";

import { planReorganization } from "../../src/manager/index.js";

const files = [
  "Index.md",
  "Geografia/Sebá.md",
  "Geografia/Rios/Nilo.md",
  "Geografia/map.png",
  "Other/Note.md",
];

function plan(changes: Parameters<typeof planReorganization>[0]["changes"]) {
  return planReorganization({ files, changes });
}

describe("moving a folder", () => {
  it("moves everything in it as one Move of the folder", () => {
    const result = plan([
      { type: "move", from: "Geografia", to: "Other/Geografia" },
    ]);
    if (!result.ok) throw new Error(result.error);
    expect(result.changeset).toEqual(
      expect.arrayContaining([
        {
          type: "rename",
          from: "Geografia/Sebá.md",
          to: "Other/Geografia/Sebá.md",
        },
        {
          type: "rename",
          from: "Geografia/Rios/Nilo.md",
          to: "Other/Geografia/Rios/Nilo.md",
        },
        {
          type: "rename",
          from: "Geografia/map.png",
          to: "Other/Geografia/map.png",
        },
      ]),
    );
    expect(result.changeset).toHaveLength(3);
    expect(result.subject).toBe("Move Geografia");
    expect(result.body).toBe("- Move Geografia → Other/Geografia");
    expect(result.files).toContain("Other/Geografia/Rios/Nilo.md");
    expect(result.files).not.toContain("Geografia/map.png");
  });

  it("renames a folder and says Rename", () => {
    const result = plan([{ type: "move", from: "Geografia", to: "Geo" }]);
    if (!result.ok) throw new Error(result.error);
    expect(result.subject).toBe("Rename Geografia");
    expect(result.files).toContain("Geo/Rios/Nilo.md");
  });

  it("allows a case-only rename of a folder", () => {
    const result = plan([{ type: "move", from: "Geografia", to: "geografia" }]);
    expect(result).toMatchObject({ ok: true, subject: "Rename Geografia" });
  });

  it("counts a folder as one item among several", () => {
    const result = plan([
      { type: "move", from: "Geografia", to: "Geo" },
      { type: "move", from: "Index.md", to: "Home.md" },
    ]);
    if (!result.ok) throw new Error(result.error);
    expect(result.subject).toBe("Reorganize 2 items");
    expect(result.body).toBe(
      "- Rename Geografia → Geo\n- Rename Index.md → Home.md",
    );
  });

  it("refuses a move into itself or a descendant", () => {
    for (const to of ["Geografia/Rios/Geografia", "Geografia/Geografia"]) {
      const result = plan([{ type: "move", from: "Geografia", to }]);
      expect(result).toMatchObject({ ok: false });
      if (!result.ok) expect(result.error).toMatch(/itself/);
    }
  });

  it("refuses a folder name that is taken", () => {
    const result = plan([{ type: "move", from: "Geografia", to: "Other" }]);
    expect(result).toMatchObject({ ok: false });
    // Merging two folders would overwrite nothing here, but a clash must be refused.
    const clash = planReorganization({
      files: ["A/x.md", "B/x.md"],
      changes: [{ type: "move", from: "A", to: "B" }],
    });
    expect(clash).toMatchObject({ ok: false });
    if (!clash.ok) expect(clash.error).toMatch(/already exists/);
  });

  it("refuses an invalid folder name", () => {
    const result = plan([{ type: "move", from: "Geografia", to: "../Geo" }]);
    expect(result).toMatchObject({ ok: false });
  });

  it("follows a later change to a file inside the moved folder", () => {
    const result = plan([
      { type: "move", from: "Geografia", to: "Geo" },
      { type: "move", from: "Geo/map.png", to: "Geo/mapa.png" },
    ]);
    if (!result.ok) throw new Error(result.error);
    expect(result.changeset).toContainEqual({
      type: "rename",
      from: "Geografia/map.png",
      to: "Geo/mapa.png",
    });
  });

  it("rewrites links to and between the Notes of a moved folder", () => {
    const notes = {
      "Index.md": "[[Sebá]] and [[Geografia/Rios/Nilo|Nilo]] and ![[map.png]]",
      "Geografia/Sebá.md": "[[Nilo]] [[Index]]",
      "Geografia/Rios/Nilo.md": "[[Geografia/Sebá]]",
    };
    const result = planReorganization({
      files,
      notes,
      changes: [{ type: "move", from: "Geografia", to: "Geo" }],
    });
    if (!result.ok) throw new Error(result.error);
    const writes = new Map(
      result.changeset.flatMap((c) =>
        c.type === "write" ? [[c.path, c.content]] : [],
      ),
    );
    // Bare names still resolve; a folder-path link follows the folder.
    expect(writes.get("Index.md")).toBe(
      "[[Sebá]] and [[Geo/Rios/Nilo|Nilo]] and ![[map.png]]",
    );
    expect(writes.get("Geo/Rios/Nilo.md")).toBe("[[Geo/Sebá]]");
    expect(writes.has("Geo/Sebá.md")).toBe(false);
  });

  it("lists the URL of every Note in a moved folder", () => {
    const result = plan([{ type: "move", from: "Geografia", to: "Geo" }]);
    if (!result.ok) throw new Error(result.error);
    expect(result.urls.map((u) => [u.from, u.to])).toEqual([
      ["/geografia/rios/nilo", "/geo/rios/nilo"],
      ["/geografia/seba", "/geo/seba"],
    ]);
  });
});

describe("moving an Asset", () => {
  it("rewrites the Embeds of it, keeping size and path style", () => {
    const notes = {
      "Index.md": "![[map.png|200]] ![[Geografia/map.png]]",
      "Other/Note.md": "![[map.png]]",
    };
    const result = planReorganization({
      files,
      notes,
      changes: [
        { type: "move", from: "Geografia/map.png", to: "Other/map.png" },
      ],
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.subject).toBe("Move Geografia/map.png");
    const writes = new Map(
      result.changeset.flatMap((c) =>
        c.type === "write" ? [[c.path, c.content]] : [],
      ),
    );
    expect(writes.get("Index.md")).toBe(
      "![[map.png|200]] ![[Other/map.png]]",
    );
    expect(writes.has("Other/Note.md")).toBe(false);
  });
});
