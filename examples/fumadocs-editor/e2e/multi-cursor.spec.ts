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

test("modifier-click adds a cursor, and typing applies to both", async ({
  page,
}) => {
  const content = await openWithLines(page, ["one", "two", "three"]);
  const first = await lineBox(page, 0);
  const third = await lineBox(page, 2);
  await page.mouse.click(first.x + 2, first.y + first.height / 2);
  await page.keyboard.down("ControlOrMeta");
  await page.mouse.click(third.x + 2, third.y + third.height / 2);
  await page.keyboard.up("ControlOrMeta");
  await expect(page.locator(".cm-cursor")).toHaveCount(2);
  await page.keyboard.type("-");
  await expect(content).toHaveText(/^-one\s*two\s*-three$/);
});

test("Alt-drag selects a rectangle with a cursor on each line", async ({
  page,
}) => {
  const content = await openWithLines(page, ["abcdef", "abcdef", "abcdef"]);
  const first = await lineBox(page, 0);
  const last = await lineBox(page, 2);
  await page.keyboard.down("Alt");
  await page.mouse.move(first.x + 2, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(first.x + 40, last.y + last.height / 2, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await page.keyboard.press("Delete");
  const text = await content.innerText();
  const rows = text.split("\n").filter(Boolean);
  expect(rows).toHaveLength(3);
  // The same columns were cut on every line.
  expect(new Set(rows).size).toBe(1);
  expect(rows[0]?.length).toBeLessThan(6);
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
