import fs from "node:fs";
import { expect, test } from "@playwright/test";

import { FAKE_GITHUB_URL } from "./support/config";
import { signInAs } from "./support/sign-in";

const NOTE = "tests/fixtures/vault/Alpha Note.md";
const BASE = "http://localhost:3103";

const edit = (page: import("@playwright/test").Page) =>
  page.getByRole("link", { name: "Edit", exact: true });

test("renders the fixture Vault as a Wiki", async ({ page }) => {
  await page.goto("/alpha-note");
  await expect(
    page.getByRole("heading", { name: "Alpha Note" }).first(),
  ).toBeVisible();
  await expect(page.getByText("Body of the alpha note.")).toBeVisible();

  await page.goto("/");
  await expect(page.getByText("Welcome to the fixture Vault.")).toBeVisible();
});

test("shows the same page actions signed out and signed in", async ({
  page,
  context,
}) => {
  const row = page.getByRole("link", { name: "View on GitHub" }).locator("..");

  await page.goto("/alpha-note");
  await expect(edit(page)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "View on GitHub" }),
  ).toHaveAttribute(
    "href",
    "https://github.com/acme/wiki/blob/main/tests/fixtures/vault/Alpha%20Note.md",
  );
  await expect(
    page.getByRole("button", { name: "Copy Markdown" }),
  ).toBeVisible();
  const signedOut = await row.innerText();

  await signInAs(context, BASE);
  await page.reload();
  await expect(page.getByTestId("account")).toBeVisible();
  expect(await row.innerText()).toBe(signedOut);
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

test.describe("account area", () => {
  test("is empty for a signed-out visitor", async ({ page }) => {
    await page.goto("/alpha-note");
    await expect(edit(page)).toBeVisible();
    await expect(page.getByTestId("account")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
  });

  test("shows avatar, @login and Sign out when signed in, and Sign out works", async ({
    page,
    context,
  }) => {
    await signInAs(context, BASE);
    await page.goto("/alpha-note");

    const account = page.getByTestId("account");
    await expect(account).toContainText("@octocat");
    await expect(account.locator("img")).toBeVisible();

    await account.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByTestId("account")).toHaveCount(0);
  });
});

test.describe("the editor route tree", () => {
  test("sends a signed-out visitor to GitHub sign-in", async ({ page }) => {
    await page.goto("/edit/alpha-note");
    await expect(page).toHaveURL(
      new RegExp(`^${FAKE_GITHUB_URL}/login/oauth/authorize`),
    );
  });

  test("lets a signed-in visitor in", async ({ page, context }) => {
    await signInAs(context, BASE);
    await page.goto("/edit/alpha-note");
    await expect(page.getByTestId("editor-placeholder")).toBeVisible();
  });
});

test.describe("sign-in through the fake GitHub", () => {
  test("Edit goes to GitHub and returns to the same editor route", async ({
    page,
  }) => {
    await page.goto("/alpha-note");
    await edit(page).click();

    await expect(page).toHaveURL(/\/login\/oauth\/authorize/);
    await page.getByRole("link", { name: "Authorize as octocat" }).click();

    await expect(page).toHaveURL(`${BASE}/edit/alpha-note`);
    await expect(page.getByTestId("editor-placeholder")).toBeVisible();
    await expect(page.getByTestId("account")).toContainText("@octocat");
  });

  test("cancelling lands on the read-only page with a toast", async ({
    page,
  }) => {
    await page.goto("/alpha-note");
    await edit(page).click();
    await page.getByRole("link", { name: "Cancel" }).click();

    await expect(page).toHaveURL(/\/alpha-note$/);
    await expect(page.getByTestId("toast")).toContainText(/cancel/i);
    await expect(page.getByTestId("account")).toHaveCount(0);
  });

  test("an account the hook rejects is told it isn't allowed to edit", async ({
    page,
  }) => {
    await page.goto("/alpha-note");
    await edit(page).click();
    await page.getByRole("link", { name: "Authorize as blocked-user" }).click();

    await expect(page).toHaveURL(/\/alpha-note$/);
    await expect(page.getByTestId("toast")).toHaveText(
      /This account isn't allowed to edit/,
    );
    await expect(page.getByTestId("account")).toHaveCount(0);
  });
});
