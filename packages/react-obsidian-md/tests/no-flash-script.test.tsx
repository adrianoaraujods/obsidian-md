// @vitest-environment jsdom
import { act } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PropertiesPanel } from "../src/index.js";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const panel = (
  <PropertiesPanel defaultOpen storageKey="k">
    rows
  </PropertiesPanel>
);

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("PropertiesPanel no-flash script", () => {
  it("is part of the server render", () => {
    expect(renderToString(panel)).toContain("<script");
  });

  it("is not rendered by a client-side render, which React rejects", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const el = document.createElement("div");
    document.body.append(el);
    await act(async () => createRoot(el).render(panel));
    expect(el.querySelector("script")).toBeNull();
    expect(error).not.toHaveBeenCalled();
  });

  it("hydrates the server render without complaint", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const el = document.createElement("div");
    el.innerHTML = renderToString(panel);
    document.body.append(el);
    await act(async () => {
      hydrateRoot(el, panel);
    });
    expect(el.querySelector("[data-properties-panel]")).not.toBeNull();
    expect(error).not.toHaveBeenCalled();
  });
});
