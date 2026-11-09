import { describe, expect, it } from "vitest";
import { menuItemsFor } from "./items";

const labels = (kind: Parameters<typeof menuItemsFor>[0]) =>
  menuItemsFor(kind).map((item) => item.label);

describe("the File Tree menu", () => {
  it("offers a Note Edit, Rename/Move…, New note here and Delete", () => {
    expect(labels("note")).toEqual([
      "Edit",
      "Rename/Move…",
      "New note here",
      "Delete",
    ]);
  });
  it("offers a folder New note here and Reorder…", () => {
    expect(labels("folder")).toEqual(["New note here", "Reorder…"]);
  });
  it("offers the root of the File Tree Reorder…", () => {
    expect(labels("root")).toEqual(["Reorder…"]);
  });
});
