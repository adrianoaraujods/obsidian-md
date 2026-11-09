import { expect, type Page, test } from "@playwright/test";

// The open Example has no sign-in: the menu is always there in development
// (where editing exists) and absent from a production build.
const treeLink = (page: Page, name: string) =>
  page.locator("#nd-sidebar").getByRole("link", { name, exact: true });
// A folder row's name can start with its `icon`, which Fumadocs prints as text.
const folderRow = (page: Page, name: string) =>
  page
    .locator("#nd-sidebar")
    .getByRole("button", { name: new RegExp(`${name}$`) });
const items = (page: Page) =>
  page.getByRole("menu").getByRole("menuitem").allTextContents();

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1600 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
});

test("a Note offers Edit and Rename/Move…", async ({ page }) => {
  await treeLink(page, "Beta Note").click({ button: "right" });
  expect(await items(page)).toEqual(["Edit", "Rename/Move…"]);

  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
});

test("Edit opens the editor for that Note", async ({ page }) => {
  await treeLink(page, "Beta Note").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await expect(page).toHaveURL(/\/edit\/beta-note$/);
});

test("Rename/Move… opens the Manager on that Note", async ({ page }) => {
  await treeLink(page, "Beta Note").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rename/Move…" }).click();

  await expect(page).toHaveURL(/\/manage\?focus=Beta\+Note\.md$/);
  const row = page.locator('[data-path="Beta Note.md"]');
  await expect(row).toHaveAttribute("data-focused", "true");
  await expect(row).toBeInViewport();
});

test("Reorder… on a nested folder opens the Manager on it", async ({
  page,
}) => {
  await folderRow(page, "Manager Fixture").click();
  await folderRow(page, "Ordered").click({ button: "right" });
  expect(await items(page)).toEqual(["Reorder…"]);
  await page.getByRole("menuitem", { name: "Reorder…" }).click();

  await expect(page).toHaveURL(/\/manage\?focus=Manager\+Fixture%2FOrdered$/);
  await expect(
    page.locator('[data-folder="Manager Fixture/Ordered"]'),
  ).toHaveAttribute("data-focused", "true");
});

test("the root of the File Tree offers Reorder…", async ({ page }) => {
  const box = await page
    .locator("#nd-sidebar [data-radix-scroll-area-viewport]")
    .boundingBox();
  if (!box) throw new Error("the File Tree has no box");
  await page.mouse.click(box.x + 20, box.y + box.height - 10, {
    button: "right",
  });
  expect(await items(page)).toEqual(["Reorder…"]);
  await page.getByRole("menuitem", { name: "Reorder…" }).click();

  await expect(page).toHaveURL(/\/manage\?focus=%2F$/);
  await expect(page.locator('[data-folder=""]')).toHaveAttribute(
    "data-focused",
    "true",
  );
});

test("a deep link to a missing item still opens the Manager", async ({
  page,
}) => {
  await page.goto("/manage?focus=Nope%2FGone.md");
  await expect(page.locator('[data-path="Beta Note.md"]')).toBeVisible();
  await expect(page.locator('[data-focused="true"]')).toHaveCount(0);
});
