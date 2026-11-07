import { expect, type Locator, type Page, test } from "@playwright/test";

// Real keyboard and mouse input against the built package, as a user types.

async function openEmpty(page: Page): Promise<Locator> {
  await page.goto("/edit/rich-note");
  const content = page.locator(".cm-content");
  await expect(content).toContainText("Callout body text.");
  await content.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Delete");
  return content;
}

const lines = async (content: Locator) =>
  (await content.innerText()).replace(/ /g, " ").split("\n");

const lineBox = async (page: Page, index: number) => {
  const box = await page.locator(".cm-line").nth(index).boundingBox();
  if (!box) throw new Error(`line ${index} has no box`);
  return box;
};

test.describe("multi-cursor gestures", () => {
  async function setup(page: Page) {
    const content = await openEmpty(page);
    await page.keyboard.type("one");
    await page.keyboard.press("Enter");
    await page.keyboard.type("two");
    await page.keyboard.press("Enter");
    await page.keyboard.type("three");
    return content;
  }

  test("Ctrl-click does not add a cursor", async ({ page }) => {
    await setup(page);
    const first = await lineBox(page, 0);
    const third = await lineBox(page, 2);
    await page.mouse.click(first.x + 2, first.y + first.height / 2);
    await page.keyboard.down("Control");
    await page.mouse.click(third.x + 2, third.y + third.height / 2);
    await page.keyboard.up("Control");
    await expect(page.locator(".cm-cursor")).toHaveCount(1);
  });

  test("Alt-click adds a second cursor", async ({ page }) => {
    await setup(page);
    const first = await lineBox(page, 0);
    const third = await lineBox(page, 2);
    await page.mouse.click(first.x + 2, first.y + first.height / 2);
    await page.keyboard.down("Alt");
    await page.mouse.click(third.x + 2, third.y + third.height / 2);
    await page.keyboard.up("Alt");
    await expect(page.locator(".cm-cursor")).toHaveCount(2);
  });
});

test.describe("Auto-pair and Selection Wrap", () => {
  for (const [open, close] of [
    ["(", ")"],
    ["[", "]"],
    ["{", "}"],
    ['"', '"'],
    ["`", "`"],
  ] as const) {
    test(`typing ${open} inserts ${close} with the cursor between`, async ({
      page,
    }) => {
      const content = await openEmpty(page);
      await page.keyboard.type(open);
      await expect(content).toHaveText(`${open}${close}`);
      await page.keyboard.type("x");
      await expect(content).toHaveText(`${open}x${close}`);
    });
  }

  test("[ twice gives [[]] and opens the picker", async ({ page }) => {
    const content = await openEmpty(page);
    await page.keyboard.type("[[");
    await expect(content).toHaveText("[[]]");
    await expect(page.locator(".cm-tooltip-autocomplete")).toBeVisible();
  });

  test("typing * over a selection wraps it, a second * makes bold", async ({
    page,
  }) => {
    const content = await openEmpty(page);
    await page.keyboard.type("word");
    await page.keyboard.press("Shift+Home");
    await page.keyboard.type("*");
    await expect(content).toHaveText("*word*");
    await page.keyboard.type("*");
    await expect(content).toHaveText("**word**");
  });

  test("Mod-b bolds a selection", async ({ page }) => {
    const content = await openEmpty(page);
    await page.keyboard.type("word");
    await page.keyboard.press("Shift+Home");
    await page.keyboard.press("ControlOrMeta+b");
    await expect(content).toHaveText("**word**");
  });
});

test.describe("continuation on Enter", () => {
  async function enterAfter(page: Page, first: string) {
    const content = await openEmpty(page);
    await page.keyboard.type(first);
    // Typing may have auto-paired; the closer is not part of these lines.
    await page.keyboard.press("Enter");
    return content;
  }

  test("bullet item", async ({ page }) => {
    const content = await enterAfter(page, "- item");
    await page.keyboard.type("next");
    expect(await lines(content)).toEqual(["- item", "- next"]);
  });

  test("numbered item", async ({ page }) => {
    const content = await enterAfter(page, "1. item");
    await page.keyboard.type("next");
    expect(await lines(content)).toEqual(["1. item", "2. next"]);
  });

  test("task item", async ({ page }) => {
    const content = await enterAfter(page, "- [ ] task");
    await page.keyboard.type("next");
    expect(await lines(content)).toEqual(["- [ ] task", "- [ ] next"]);
  });

  test("quote line", async ({ page }) => {
    const content = await enterAfter(page, "> quote");
    await page.keyboard.type("next");
    expect(await lines(content)).toEqual(["> quote", "> next"]);
  });

  test("Callout body line", async ({ page }) => {
    const content = await openEmpty(page);
    await page.keyboard.type("> [!note] Title");
    await page.keyboard.press("Enter");
    await page.keyboard.type("body");
    await page.keyboard.press("Enter");
    await page.keyboard.type("more");
    expect(await lines(content)).toEqual([
      "> [!note] Title",
      "> body",
      "> more",
    ]);
  });

  test("Enter on an empty item ends the list", async ({ page }) => {
    const content = await enterAfter(page, "- item");
    await page.keyboard.press("Enter");
    await page.keyboard.type("after");
    expect(await lines(content)).toEqual(["- item", "after"]);
  });
});

test("Tab and Shift-Tab indent and outdent a list item", async ({ page }) => {
  const content = await openEmpty(page);
  await page.keyboard.type("- item");
  await page.keyboard.press("Tab");
  expect((await lines(content))[0]).toMatch(/^\s+- item$/);
  await page.keyboard.press("Shift+Tab");
  expect(await lines(content)).toEqual(["- item"]);
});
