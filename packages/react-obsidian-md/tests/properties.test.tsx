// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Properties } from "../src/index.js";

function render(props: Parameters<typeof Properties>[0]) {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(<Properties {...props} />);
  return container;
}

const rows = (root: Element) =>
  [...root.querySelectorAll("[data-properties-row]")].map((row) => ({
    key: row.getAttribute("data-property-key"),
    type: row.getAttribute("data-property-type"),
  }));

describe("Properties", () => {
  it("renders one row per property with its key and inferred type", () => {
    const root = render({
      properties: {
        status: "draft",
        tags: ["a", "b"],
        count: 3,
        done: true,
        due: { date: "2025-02-03", kind: "date" },
        at: { date: "2026-02-17T11:33", kind: "datetime" },
        list: ["x", "y"],
        Aliases: ["z"],
      },
    });
    expect(rows(root)).toEqual([
      { key: "status", type: "text" },
      { key: "tags", type: "tags" },
      { key: "count", type: "number" },
      { key: "done", type: "checkbox" },
      { key: "due", type: "date" },
      { key: "at", type: "datetime" },
      { key: "list", type: "multitext" },
      { key: "Aliases", type: "aliases" },
    ]);
  });

  it("renders nothing for missing, empty or all-hidden properties", () => {
    expect(render({ properties: undefined }).innerHTML).toBe("");
    expect(render({ properties: { a: null, b: [], c: "  " } }).innerHTML).toBe(
      "",
    );
    expect(
      render({ properties: { title: "x" }, hiddenKeys: ["title"] }).innerHTML,
    ).toBe("");
  });

  it("emits data attributes and no class names", () => {
    const root = render({ properties: { status: "draft" } });
    expect(root.querySelector("[data-properties-panel]")).not.toBeNull();
    expect(root.querySelector("[data-properties-trigger]")).not.toBeNull();
    expect(root.querySelector("[data-properties-content]")).not.toBeNull();
    expect(root.querySelector("[data-properties-value]")?.textContent).toBe(
      "draft",
    );
    expect(root.querySelector("[class]")).toBeNull();
  });

  it("starts at the default open state and carries the no-flash script", () => {
    const closed = render({ properties: { a: "b" }, defaultOpen: false });
    expect(
      closed
        .querySelector("[data-properties-panel]")
        ?.getAttribute("data-open"),
    ).toBe("false");
    expect(closed.querySelector("script")?.textContent).toContain(
      "properties-panel:page",
    );
    const quiet = render({ properties: { a: "b" }, noFlash: false });
    expect(quiet.querySelector("script")).toBeNull();
  });

  it("renders icon slots only when supplied", () => {
    const bare = render({ properties: { a: "b" } });
    expect(bare.querySelector("[data-properties-type-icon]")).toBeNull();
    expect(bare.querySelector("[data-properties-expand-icon]")).toBeNull();

    const root = render({
      properties: { a: "b", n: 1 },
      icons: {
        text: <i data-testid="text-icon" />,
        expand: <i data-testid="expand-icon" />,
      },
    });
    const slots = root.querySelectorAll("[data-properties-type-icon]");
    expect(slots).toHaveLength(1);
    expect(slots[0]?.querySelector("[data-testid=text-icon]")).not.toBeNull();
    expect(
      root.querySelector(
        "[data-properties-expand-icon] [data-testid=expand-icon]",
      ),
    ).not.toBeNull();
  });

  it("renders links, tags and booleans through stable attributes", () => {
    const root = render({
      properties: {
        up: { url: "/note", label: "Note" },
        out: { url: "https://example.com", label: "Ext" },
        gone: { label: "Missing", unresolved: true },
        tags: ["wiki"],
        done: true,
        todo: false,
      },
    });
    const up = root.querySelector('a[href="/note"]');
    expect(up?.getAttribute("data-property-link")).toBe("internal");
    const out = root.querySelector('a[href="https://example.com"]');
    expect(out?.getAttribute("data-property-link")).toBe("external");
    expect(out?.getAttribute("target")).toBe("_blank");
    const gone = root.querySelector("[data-unresolved]");
    expect(gone?.tagName).toBe("SPAN");
    expect(gone?.textContent).toBe("Missing");
    expect(root.querySelector("[data-property-tag]")?.textContent).toBe(
      "#wiki",
    );
    const flags = [...root.querySelectorAll("[data-property-checkbox]")];
    expect(flags.map((f) => f.getAttribute("data-checked"))).toEqual([
      "true",
      "false",
    ]);
  });

  it("lets the caller swap the link component for internal links", () => {
    const root = render({
      properties: { up: { url: "/note", label: "Note" } },
      linkComponent: (props) => <a data-custom {...props} />,
    });
    expect(root.querySelector("a[data-custom]")?.getAttribute("href")).toBe(
      "/note",
    );
  });

  it("renders dates as ISO first, and lets the caller override them", () => {
    const root = render({
      properties: { due: { date: "2025-02-03", kind: "date" } },
    });
    const time = root.querySelector("time");
    expect(time?.getAttribute("datetime")).toBe("2025-02-03");
    expect(time?.textContent).toBe("2025-02-03");

    const custom = render({
      properties: { due: { date: "2025-02-03", kind: "date" } },
      renderDate: (value) => <b data-custom>{`on ${value.date}`}</b>,
    });
    expect(custom.querySelector("[data-custom]")?.textContent).toBe(
      "on 2025-02-03",
    );
  });
});
