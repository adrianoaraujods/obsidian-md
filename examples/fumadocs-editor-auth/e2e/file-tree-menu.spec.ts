import { expect, type Page, test } from "@playwright/test";

import { FAKE_GITHUB_URL, PROD_PORT } from "./support/config";
import { signInAs } from "./support/sign-in";

const BASE = `http://localhost:${PROD_PORT}`;
const REPO_PATH = "tests/fixtures/vault/Beta Note.md";

const control = (path: string, body?: unknown) =>
  fetch(`${FAKE_GITHUB_URL}/__test/${path}`, {
    method: body === undefined ? "GET" : "POST",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }).then((response) => response.json());

const state = () =>
  control("state") as Promise<{
    files: Record<string, string>;
    commits: { message: string; path: string }[];
  }>;

test.describe.configure({ mode: "serial" });

const treeLink = (page: Page, name: string) =>
  page.locator("#nd-sidebar").getByRole("link", { name, exact: true });

async function rightClick(page: Page, { signedIn = true } = {}) {
  // The account footer shows once the browser has read the session.
  if (signedIn) await expect(page.getByTestId("account")).toBeVisible();
  else await page.waitForLoadState("networkidle");
  await treeLink(page, "Beta Note").click({ button: "right" });
}

// A folder row's name can start with its `icon`, which Fumadocs prints as text.
const folderRow = (page: Page, name: string) =>
  page
    .locator("#nd-sidebar")
    .getByRole("button", { name: new RegExp(`${name}$`) });

/** Right-click the empty part of the File Tree, below the last row. */
async function rightClickRoot(page: Page) {
  await expect(page.getByTestId("account")).toBeVisible();
  const box = await page
    .locator("#nd-sidebar [data-radix-scroll-area-viewport]")
    .boundingBox();
  if (!box) throw new Error("the File Tree has no box");
  await page.mouse.click(box.x + 20, box.y + box.height - 10, {
    button: "right",
  });
}

const items = (page: Page) =>
  page.getByRole("menu").getByRole("menuitem").allTextContents();

test.describe("signed in", () => {
  test.beforeEach(async ({ context }) => {
    await control("reset", {});
    await signInAs(context, BASE);
  });

  test("right-clicking a Note offers Edit and Delete", async ({ page }) => {
    await page.goto("/");
    await rightClick(page);

    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem", { name: "Edit" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Delete" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
  });

  test("a Note also offers Rename/Move… and New note here", async ({
    page,
  }) => {
    await page.goto("/");
    await rightClick(page);

    expect(await items(page)).toEqual([
      "Edit",
      "Rename/Move…",
      "New note here",
      "Delete",
    ]);
  });

  test("Rename/Move… opens the Manager on that Note", async ({ page }) => {
    await page.goto("/");
    await rightClick(page);
    await page.getByRole("menuitem", { name: "Rename/Move…" }).click();

    await expect(page).toHaveURL(/\/manage\?focus=Beta\+Note\.md$/);
    const row = page.locator('[data-path="Beta Note.md"]');
    await expect(row).toHaveAttribute("data-focused", "true");
    await expect(row).toBeInViewport();
  });

  test("a folder offers New note here and Reorder…", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("account")).toBeVisible();
    await folderRow(page, "Manager Fixture").click({ button: "right" });

    expect(await items(page)).toEqual(["New note here", "Reorder…"]);
    await page.getByRole("menuitem", { name: "New note here" }).click();
    await expect(page).toHaveURL(/\/edit\/new\?folder=Manager\+Fixture$/);
  });

  test("Reorder… on a nested folder opens the Manager on it", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("account")).toBeVisible();
    await folderRow(page, "Manager Fixture").click();
    await folderRow(page, "Ordered").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Reorder…" }).click();

    await expect(page).toHaveURL(/\/manage\?focus=Manager\+Fixture%2FOrdered$/);
    await expect(
      page.locator('[data-folder="Manager Fixture/Ordered"]'),
    ).toHaveAttribute("data-focused", "true");
  });

  test("the root of the File Tree offers Reorder…", async ({ page }) => {
    await page.goto("/");
    await rightClickRoot(page);

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

  test("Edit opens the editor for that Note", async ({ page }) => {
    await page.goto("/");
    await rightClick(page);
    await page.getByRole("menuitem", { name: "Edit" }).click();

    await expect(page).toHaveURL(/\/edit\/beta-note$/);
  });

  test("Delete warns, and cancelling commits nothing", async ({ page }) => {
    await page.goto("/");
    await rightClick(page);
    await page.getByRole("menuitem", { name: "Delete" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Beta Note.md");
    await expect(dialog).toContainText("until the next redeploy");
    await expect(dialog).toContainText("links are not rewritten");

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
    expect((await state()).commits).toHaveLength(0);
  });

  test("confirming Delete commits the removal", async ({ page }) => {
    await page.goto("/");
    await rightClick(page);
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Delete" })
      .click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("Deleted Beta Note.md")).toBeVisible();
    await expect.poll(async () => (await state()).commits).toHaveLength(1);
    const { commits, files } = await state();
    expect(commits[0]?.path).toBe(REPO_PATH);
    expect(files[REPO_PATH]).toBeUndefined();
  });
});

test("a signed-out visitor gets no menu", async ({ page }) => {
  await page.goto("/");
  await rightClick(page, { signedIn: false });

  await expect(page.getByRole("menu")).toHaveCount(0);
});

test("a signed-out visitor gets no menu on a folder or the root either", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await folderRow(page, "Manager Fixture").click({ button: "right" });
  await expect(page.getByRole("menu")).toHaveCount(0);

  const box = await page
    .locator("#nd-sidebar [data-radix-scroll-area-viewport]")
    .boundingBox();
  if (!box) throw new Error("the File Tree has no box");
  await page.mouse.click(box.x + 20, box.y + box.height - 10, {
    button: "right",
  });
  await expect(page.getByRole("menu")).toHaveCount(0);
});
