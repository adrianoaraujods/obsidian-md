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

const THEMES = ["light", "dark"] as const;
type Theme = (typeof THEMES)[number];

// Rich Note (fixture): heading, Callout, Highlight, Embed, Wiki Link.
async function openRichNote(page: Page, theme: Theme) {
  // next-themes reads this key before first paint.
  await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
  await page.goto("/edit/rich-note");
  await expect(page.locator("html")).toHaveClass(
    theme === "dark" ? /\bdark\b/ : /\blight\b/,
  );
  const content = page.getByTestId("editor").locator(".cm-content");
  await expect(content).toContainText("Callout body text.");
  return content;
}

const css = (page: Page, selector: string, prop: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

const px = async (page: Page, selector: string) =>
  Number.parseFloat(await css(page, selector, "font-size"));

/** Types after the Note's last line, then clicks away to render it. */
async function typeAtEnd(page: Page, text: string) {
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(text);
}

for (const theme of THEMES) {
  test.describe(`${theme} theme`, () => {
    test("headings shrink from h1 to h6, stay above body text and are bold", async ({
      page,
    }) => {
      const content = await openRichNote(page, theme);
      await content.click();
      await typeAtEnd(
        page,
        "\n\n## Two\n\n### Three\n\n#### Four\n\n##### Five\n\n###### Six\n\nend",
      );
      const sizes = [
        await px(page, ".cm-obsidian-h1"),
        await px(page, ".cm-obsidian-h2"),
        await px(page, ".cm-obsidian-h3"),
        await px(page, ".cm-obsidian-h4"),
        await px(page, ".cm-obsidian-h5"),
        await px(page, ".cm-obsidian-h6"),
      ];
      const body = await px(page, ".cm-line:not(.cm-obsidian-heading)");
      for (let i = 1; i < sizes.length; i++) {
        expect(sizes[i - 1]).toBeGreaterThan(sizes[i] as number);
      }
      expect(sizes[0]).toBeGreaterThanOrEqual(body * 1.9);
      expect(sizes[4]).toBeGreaterThan(body);
      for (const n of [1, 2, 3, 4, 5, 6]) {
        expect(
          Number(await css(page, `.cm-obsidian-h${n}`, "font-weight")),
        ).toBeGreaterThanOrEqual(700);
      }
    });

    test("strong is bold, emphasis is italic and the font is not monospace", async ({
      page,
    }) => {
      const content = await openRichNote(page, theme);
      await content.click();
      await typeAtEnd(page, "\n\n**loud** and *soft*\n\nafter");
      expect(
        Number(await css(page, ".cm-obsidian-strong", "font-weight")),
      ).toBeGreaterThanOrEqual(700);
      expect(await css(page, ".cm-obsidian-em", "font-style")).toBe("italic");
      expect(await css(page, ".cm-line", "font-family")).toMatch(/sans/i);
    });

    test("the cursor follows the theme and stands out from the editor background", async ({
      page,
    }) => {
      const content = await openRichNote(page, theme);
      await content.click();
      // Several cursors need the drawn cursor, which hides the native caret.
      const cursor = await css(page, ".cm-cursor", "border-left-color");
      const text = await css(page, ".cm-content", "color");
      const background = await css(page, ".cm-editor", "background-color");
      expect(cursor).toBe(text);
      expect(cursor).not.toBe(background);
      // CodeMirror's base theme paints it black; that is invisible in dark.
      if (theme === "dark") expect(cursor).not.toBe("rgb(0, 0, 0)");
    });

    test("the selection is tinted and differs from the editor background", async ({
      page,
    }) => {
      const content = await openRichNote(page, theme);
      await content.click();
      await page.keyboard.press("ControlOrMeta+a");
      // The drawn selection layer stands in for the browser's own.
      const selection = await css(
        page,
        ".cm-selectionBackground",
        "background-color",
      );
      const background = await css(page, ".cm-editor", "background-color");
      expect(selection).not.toBe("rgba(0, 0, 0, 0)");
      expect(selection).not.toBe(background);
    });

    test("the ## markers dim while the cursor is on the heading line", async ({
      page,
    }) => {
      const content = await openRichNote(page, theme);
      await content.click();
      await typeAtEnd(page, "\n\n## Two\n\nend");
      await expect(page.locator(".cm-obsidian-heading-mark")).toHaveCount(0);
      await page.locator(".cm-obsidian-h2").click();
      const mark = page.locator(".cm-obsidian-heading-mark");
      await expect(mark).toHaveCount(1);
      const dim = await mark.evaluate((el) => getComputedStyle(el).color);
      const line = await css(page, ".cm-obsidian-h2", "color");
      expect(dim).not.toBe(line);
    });

    test("lists, task checkboxes, Highlights and Wiki Links are styled", async ({
      page,
    }) => {
      const content = await openRichNote(page, theme);
      await content.click();
      await typeAtEnd(page, "\n\n- item\n- [ ] task\n\nend");
      await expect(page.locator(".cm-obsidian-bullet")).toHaveCount(1);
      const box = page.locator(".cm-obsidian-checkbox");
      await expect(box).toBeVisible();
      expect((await box.boundingBox())?.width).toBeGreaterThan(10);
      const mark = await css(page, "mark", "background-color");
      expect(mark).not.toBe("rgba(0, 0, 0, 0)");
      const link = await css(page, "a.internal-link", "color");
      const text = await css(page, ".cm-content", "color");
      expect(link).not.toBe(text);
    });

    test("lines with widgets are as tall as plain lines", async ({ page }) => {
      await openRichNote(page, theme);
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
      await openRichNote(page, theme);
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

    test("the [[ picker takes the theme's popover colors", async ({ page }) => {
      const content = await openRichNote(page, theme);
      await content.click();
      await typeAtEnd(page, "\n\n[[");
      const tooltip = page.locator(".cm-tooltip-autocomplete");
      await expect(tooltip).toBeVisible();
      const bg = await tooltip.evaluate(
        (el) => getComputedStyle(el).backgroundColor,
      );
      // What the page's own popover token computes to, in this theme.
      const popover = await page.evaluate(() => {
        const probe = document.createElement("div");
        probe.style.backgroundColor = "var(--popover)";
        document.body.append(probe);
        const value = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return value;
      });
      expect(bg).toBe(popover);
      // CodeMirror's own light and dark greys.
      expect(bg).not.toBe("rgb(245, 245, 245)");
      expect(bg).not.toBe("rgb(51, 51, 56)");
      const radius = await page
        .locator(".cm-tooltip")
        .first()
        .evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
      expect(radius).toBe("6px");
    });
  });
}
