import fs from "node:fs";
import { expect, test } from "@playwright/test";

const NOTE = "tests/fixtures/vault/Alpha Note.md";

test("renders the fixture Vault as a Wiki", async ({ page }) => {
  await page.goto("/alpha-note");
  await expect(
    page.getByRole("heading", { name: "Alpha Note" }).first(),
  ).toBeVisible();
  await expect(page.getByText("Body of the alpha note.")).toBeVisible();

  await page.goto("/");
  await expect(page.getByText("Welcome to the fixture Vault.")).toBeVisible();
});

test("hides Edit but shows the other actions in a production build", async ({
  page,
}) => {
  await page.goto("/alpha-note");
  await expect(
    page.getByRole("link", { name: "Edit", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "View on GitHub" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Copy Markdown" }),
  ).toBeVisible();
});

test("View on GitHub links to the Note's blob URL", async ({ page }) => {
  await page.goto("/alpha-note");
  await expect(
    page.getByRole("link", { name: "View on GitHub" }),
  ).toHaveAttribute(
    "href",
    "https://github.com/acme/wiki/blob/main/tests/fixtures/vault/Alpha%20Note.md",
  );
});

test("Copy Markdown copies the Note's source", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/alpha-note");
  await page.getByRole("button", { name: "Copy Markdown" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();

  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(fs.readFileSync(NOTE, "utf8"));
});

test("publishes a raw .md export of each Note", async ({ request }) => {
  const response = await request.get("/raw/Alpha%20Note.md");
  expect(response.ok()).toBe(true);
  expect(await response.text()).toBe(fs.readFileSync(NOTE, "utf8"));
});

test("/edit/<slug> is not served in a production build", async ({ page }) => {
  const response = await page.goto("/edit/alpha-note");
  expect(response?.status()).toBe(404);
});

test("the File Tree has no right-click menu", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page
    .locator("#nd-sidebar")
    .getByRole("link", { name: "Beta Note", exact: true })
    .click({ button: "right" });
  await expect(page.getByRole("menu")).toHaveCount(0);
});
