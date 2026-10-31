import { expect, test } from "@playwright/test";

import { PAGE_PROPERTIES_KEY } from "../src/lib/properties-keys";

test("the page's Properties Panel starts expanded", async ({ page }) => {
  await page.goto("/beta-note");
  const toggle = page.getByRole("button", { name: "Properties" });
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("draft")).toBeVisible();
});

test("collapsing hides the properties and the choice survives a reload", async ({
  page,
}) => {
  await page.goto("/beta-note");
  await page.getByRole("button", { name: "Properties" }).click();
  await expect(page.getByText("draft")).toBeHidden();

  await page.reload();
  await expect(
    page.getByRole("button", { name: "Properties" }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText("draft")).toBeHidden();
});

test("the choice carries over to other Notes", async ({ page }) => {
  await page.goto("/beta-note");
  await page.getByRole("button", { name: "Properties" }).click();
  await page.goto("/beta-note");
  await expect(page.getByText("draft")).toBeHidden();
});

test("a stored collapsed state is applied before hydration (no flash)", async ({
  page,
}) => {
  await page.goto("/beta-note");
  await page.evaluate(
    (key) => localStorage.setItem(key, "0"),
    PAGE_PROPERTIES_KEY,
  );

  // Block every script chunk: only the inline script can have run.
  await page.route("**/_next/static/**/*.js", (route) => route.abort());
  await page.reload();

  await expect(page.getByText("draft")).toBeHidden();
});

test("tabs stay in sync through the storage event", async ({
  context,
  page,
}) => {
  await page.goto("/beta-note");
  const other = await context.newPage();
  await other.goto("/beta-note");

  await other.getByRole("button", { name: "Properties" }).click();
  await expect(page.getByText("draft")).toBeHidden();
});

test("a Note without properties shows no panel", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Properties" })).toHaveCount(0);
});
