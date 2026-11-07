import { expect, type Page, test } from "@playwright/test";

// Types a fresh body into the Note so every test starts from known lines.
async function openWithLines(page: Page, lines: string[]) {
  await page.goto("/edit/rich-note");
  const content = page.locator(".cm-content");
  await expect(content).toContainText("Callout body text.");
  await content.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Delete");
  await page.keyboard.type(lines.join("\n"));
  return content;
}

const lineBox = async (page: Page, index: number) => {
  const box = await page.locator(".cm-line").nth(index).boundingBox();
  if (!box) throw new Error(`line ${index} has no box`);
  return box;
};

test("Alt-click adds a cursor, and typing applies to both", async ({
  page,
}) => {
  const content = await openWithLines(page, ["one", "two", "three"]);
  const first = await lineBox(page, 0);
  const third = await lineBox(page, 2);
  await page.mouse.click(first.x + 2, first.y + first.height / 2);
  await page.keyboard.down("Alt");
  await page.mouse.click(third.x + 2, third.y + third.height / 2);
  await page.keyboard.up("Alt");
  await expect(page.locator(".cm-cursor")).toHaveCount(2);
  await page.keyboard.type("-");
  await expect(content).toHaveText(/^-one\s*two\s*-three$/);
});

// Cuts the same columns out of three identical lines by dragging a rectangle.
async function dragRectangle(
  page: Page,
  drag: (
    from: { x: number; y: number },
    to: { x: number; y: number },
  ) => Promise<void>,
) {
  const content = await openWithLines(page, ["abcdef", "abcdef", "abcdef"]);
  const first = await lineBox(page, 0);
  const last = await lineBox(page, 2);
  await drag(
    { x: first.x + 2, y: first.y + first.height / 2 },
    { x: first.x + 40, y: last.y + last.height / 2 },
  );
  await page.keyboard.press("Delete");
  const rows = (await content.innerText()).split("\n").filter(Boolean);
  expect(rows).toHaveLength(3);
  // The same columns were cut on every line.
  expect(new Set(rows).size).toBe(1);
  expect(rows[0]?.length).toBeLessThan(6);
}

test("Shift-Alt-drag selects a rectangle with a cursor on each line", async ({
  page,
}) => {
  await dragRectangle(page, async (from, to) => {
    await page.keyboard.down("Shift");
    await page.keyboard.down("Alt");
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up("Alt");
    await page.keyboard.up("Shift");
  });
});

test("middle-mouse drag selects a rectangle", async ({ page }) => {
  await dragRectangle(page, async (from, to) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down({ button: "middle" });
    await page.mouse.move(to.x, to.y, { steps: 5 });
    await page.mouse.up({ button: "middle" });
  });
});

test("Ctrl-Alt-ArrowDown adds a cursor below and Escape collapses to one", async ({
  page,
}) => {
  const content = await openWithLines(page, ["one", "two", "three"]);
  await page.keyboard.press("ControlOrMeta+Home");
  await page.keyboard.press("ControlOrMeta+Alt+ArrowDown");
  await page.keyboard.press("ControlOrMeta+Alt+ArrowDown");
  await expect(page.locator(".cm-cursor")).toHaveCount(3);
  await page.keyboard.press("Escape");
  await expect(page.locator(".cm-cursor")).toHaveCount(1);
  await page.keyboard.type("x");
  // Escape keeps the cursor added last.
  await expect(content).toHaveText(/^one\s*two\s*xthree$/);
});
