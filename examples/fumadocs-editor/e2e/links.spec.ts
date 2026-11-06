import { expect, type Page, test } from "@playwright/test";

async function openEmptyNote(page: Page) {
  await page.goto("/edit/rich-note");
  const content = page.locator(".cm-content");
  await expect(content).toContainText("Callout body text.");
  await content.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Delete");
  return content;
}

const searchDialog = (page: Page) => page.getByRole("dialog");

test("Mod-k in the editor inserts a link and does not open site search", async ({
  page,
}) => {
  const content = await openEmptyNote(page);
  await page.keyboard.type("docs");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type("https://example.com");
  await expect(content).toContainText("[docs](https://example.com)");
  await expect(searchDialog(page)).toHaveCount(0);
});

test("Mod-k outside the editor still opens site search", async ({ page }) => {
  await openEmptyNote(page);
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  await page.keyboard.press("ControlOrMeta+k");
  await expect(searchDialog(page)).toBeVisible();
});
