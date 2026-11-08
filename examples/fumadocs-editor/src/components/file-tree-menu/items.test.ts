import { describe, expect, it } from "vitest";
import { menuItemsFor } from "./items";

const labels = (kind: Parameters<typeof menuItemsFor>[0]) =>
  menuItemsFor(kind).map((item) => item.label);

describe("the File Tree menu", () => {
  it("offers a Note Edit and Rename/Move…", () => {
    expect(labels("note")).toEqual(["Edit", "Rename/Move…"]);
  });
  it("offers a folder Reorder…", () => {
    expect(labels("folder")).toEqual(["Reorder…"]);
  });
  it("offers the root of the File Tree Reorder…", () => {
    expect(labels("root")).toEqual(["Reorder…"]);
  });
});
