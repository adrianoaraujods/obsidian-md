// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it } from "vitest";

import {
  PropertiesPanel,
  persistedOpenScript,
  usePersistedOpen,
} from "../src/index.js";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

async function mount(node: React.ReactNode) {
  const el = document.createElement("div");
  document.body.append(el);
  await act(async () => createRoot(el).render(node));
  return el;
}

function Probe({ k, d }: { k: string; d: boolean }) {
  const [open, setOpen] = usePersistedOpen(k, d);
  return (
    <button data-open={open} onClick={() => setOpen(!open)} type="button">
      {String(open)}
    </button>
  );
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
});

describe("usePersistedOpen", () => {
  it("uses the default until something is stored, then the stored value", async () => {
    expect((await mount(<Probe d={true} k="a" />)).textContent).toBe("true");
    localStorage.setItem("b", "0");
    expect((await mount(<Probe d={true} k="b" />)).textContent).toBe("false");
  });

  it("persists a change and syncs components sharing the key", async () => {
    const one = await mount(<Probe d={true} k="s" />);
    const two = await mount(<Probe d={true} k="s" />);
    await act(async () => one.querySelector("button")?.click());
    expect(localStorage.getItem("s")).toBe("0");
    expect(two.textContent).toBe("false");
  });

  it("keeps surfaces with different keys apart", async () => {
    const page = await mount(<Probe d={true} k="page" />);
    const preview = await mount(<Probe d={true} k="preview" />);
    await act(async () => page.querySelector("button")?.click());
    expect(preview.textContent).toBe("true");
  });
});

describe("persistedOpenScript", () => {
  it("applies the stored state to the element before hydration", () => {
    document.body.innerHTML = '<div id="x" data-open="true"></div>';
    localStorage.setItem("k", "0");
    new Function(persistedOpenScript("x", "k"))();
    expect(document.getElementById("x")?.getAttribute("data-open")).toBe(
      "false",
    );
  });

  it("leaves the element alone when nothing is stored", () => {
    document.body.innerHTML = '<div id="x" data-open="true"></div>';
    new Function(persistedOpenScript("x", "none"))();
    expect(document.getElementById("x")?.getAttribute("data-open")).toBe(
      "true",
    );
  });
});

describe("PropertiesPanel", () => {
  it("toggles open and remembers it under its storage key", async () => {
    const el = await mount(
      <PropertiesPanel defaultOpen={true} storageKey="panel">
        <p>body</p>
      </PropertiesPanel>,
    );
    const panel = el.querySelector("[data-properties-panel]");
    expect(panel?.getAttribute("data-open")).toBe("true");
    await act(async () =>
      el.querySelector<HTMLElement>("[data-properties-trigger]")?.click(),
    );
    expect(panel?.getAttribute("data-open")).toBe("false");
    expect(localStorage.getItem("panel")).toBe("0");
  });
});
