import { expect, test } from "@playwright/test";

test("Edit opens the placeholder at /edit/<slug>", async ({ page }) => {
  await page.goto("/alpha-note");
  await page.getByRole("link", { name: "Edit", exact: true }).click();

  await expect(page).toHaveURL(/\/edit\/alpha-note$/);
  await expect(page.getByTestId("editor-placeholder")).toBeVisible();
});

test("hides View on GitHub when its variables are unset", async ({ page }) => {
  await page.goto("/alpha-note");
  await expect(
    page.getByRole("button", { name: "Copy Markdown" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "View on GitHub" })).toHaveCount(
    0,
  );
});
