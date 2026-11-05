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
    const { commits, files } = await state();
    expect(commits).toHaveLength(1);
    expect(commits[0]?.path).toBe(REPO_PATH);
    expect(files[REPO_PATH]).toBeUndefined();
  });
});

test("a signed-out visitor gets no menu", async ({ page }) => {
  await page.goto("/");
  await rightClick(page, { signedIn: false });

  await expect(page.getByRole("menu")).toHaveCount(0);
});
