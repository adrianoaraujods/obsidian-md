import { expect, test } from "@playwright/test";

test("loads a Note from the fixture Vault", async ({ page }) => {
  await page.goto("/alpha-note");
  await expect(
    page.getByRole("heading", { name: "Alpha Note" }).first(),
  ).toBeVisible();
  await expect(page.getByText("Body of the alpha note.")).toBeVisible();
});

test("serves the fixture Vault, not the real one", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Welcome to the fixture Vault.")).toBeVisible();
});
