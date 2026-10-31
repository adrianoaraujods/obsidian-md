// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { FormattedDate } from "../src/index.js";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

async function mount(node: React.ReactNode) {
  const el = document.createElement("div");
  document.body.append(el);
  await act(async () => createRoot(el).render(node));
  return el;
}

describe("FormattedDate", () => {
  it("formats with Intl in the given locale after mount", async () => {
    const el = await mount(
      <FormattedDate date="2025-02-03" kind="date" locales="en-US" />,
    );
    expect(el.querySelector("time")?.textContent).toBe("2/3/2025");
    expect(el.querySelector("time")?.getAttribute("datetime")).toBe(
      "2025-02-03",
    );
  });

  it("keeps a date-only value on its local day", async () => {
    const el = await mount(
      <FormattedDate
        date="2025-02-03"
        kind="date"
        locales="en-US"
        options={{ year: "numeric", month: "long", day: "numeric" }}
      />,
    );
    expect(el.querySelector("time")?.textContent).toBe("February 3, 2025");
  });

  it("adds the time for a datetime", async () => {
    const el = await mount(
      <FormattedDate date="2026-02-17T11:33" kind="datetime" locales="en-US" />,
    );
    expect(el.querySelector("time")?.textContent).toMatch(/2\/17\/2026.*11:33/);
  });
});
