import { expect, type Page, test } from "@playwright/test";

import { FAKE_GITHUB_PORT, PROD_PORT } from "./support/config";
import { signInAs } from "./support/sign-in";

const BASE = `http://localhost:${PROD_PORT}`;

// The fake GitHub repo is shared with the other specs, which run one at a time.
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ context }) => {
  await fetch(`http://localhost:${FAKE_GITHUB_PORT}/__test/reset`, {
    method: "POST",
    body: "{}",
  });
  await signInAs(context, BASE);
});

// Rich Note (fixture): heading, Callout, Highlight, Embed, Wiki Link.
async function openRichNote(page: Page) {
  await page.goto("/edit/rich-note");
  const content = page.getByTestId("editor").locator(".cm-content");
  await expect(content).toContainText("Callout body text.");
  return content;
}

const css = (page: Page, selector: string, prop: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

test("headings render large and bold", async ({ page }) => {
  await openRichNote(page);
  const weight = Number(await css(page, ".cm-obsidian-h1", "font-weight"));
  const size = Number.parseFloat(
    await css(page, ".cm-obsidian-h1", "font-size"),
  );
  const body = Number.parseFloat(await css(page, ".cm-line", "font-size"));
  expect(weight).toBeGreaterThanOrEqual(700);
  expect(size).toBeGreaterThan(body * 1.5);
});

test("strong is bold and emphasis is italic", async ({ page }) => {
  const content = await openRichNote(page);
  await content.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("\n\n**loud** and *soft*\n\nafter");
  expect(
    Number(await css(page, ".cm-obsidian-strong", "font-weight")),
  ).toBeGreaterThanOrEqual(700);
  expect(await css(page, ".cm-obsidian-em", "font-style")).toBe("italic");
});

test("the cursor follows the text color", async ({ page }) => {
  const content = await openRichNote(page);
  await content.click();
  const cursor = await css(page, ".cm-content", "caret-color");
  const text = await css(page, ".cm-content", "color");
  expect(cursor).toBe(text);
});

test("lines with widgets are as tall as plain lines", async ({ page }) => {
  await openRichNote(page);
  const heights = await page.locator(".cm-line").evaluateAll((lines) =>
    lines.map((l) => ({
      text: l.textContent ?? "",
      height: l.getBoundingClientRect().height,
      heading: l.classList.contains("cm-obsidian-heading"),
      callout: l.classList.contains("cm-callout"),
    })),
  );
  const plain = heights.find((h) => h.text.startsWith("Inline math"));
  expect(plain).toBeDefined();
  const base = plain?.height ?? 0;
  const widgetLines = heights.filter(
    (h) =>
      !h.heading &&
      !h.callout &&
      /marked text|Beta Note|Alpha Note/.test(h.text),
  );
  expect(widgetLines.length).toBeGreaterThan(0);
  for (const l of widgetLines) expect(l.height).toBeLessThan(base * 1.5);
});

test("a Callout is one box: title and body touch, title is one line", async ({
  page,
}) => {
  await openRichNote(page);
  const [first, second] = await page
    .locator(".cm-callout")
    .evaluateAll((lines) =>
      lines.map((l) => {
        const r = l.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, height: r.height };
      }),
    );
  expect(first).toBeDefined();
  expect(second).toBeDefined();
  expect(
    Math.abs((second?.top ?? 0) - (first?.bottom ?? 0)),
  ).toBeLessThanOrEqual(1);
  expect(first?.height ?? 999).toBeLessThan(60);
});

test("the [[ picker is themed, not CodeMirror grey", async ({ page }) => {
  const content = await openRichNote(page);
  await content.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("\n\n[[");
  const tooltip = page.locator(".cm-tooltip-autocomplete");
  await expect(tooltip).toBeVisible();
  const bg = await tooltip.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  expect(bg).not.toBe("rgb(245, 245, 245)");
  const radius = await page
    .locator(".cm-tooltip")
    .first()
    .evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
  expect(radius).toBe("6px");
});
