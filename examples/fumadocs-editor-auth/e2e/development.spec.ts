import { expect, test } from "@playwright/test";

import { DEV_PORT } from "./support/config";
import { signInAs } from "./support/sign-in";

const BASE = `http://localhost:${DEV_PORT}`;

test("a signed-in visitor opens the editor with no GITHUB_REPO set", async ({
  page,
  context,
}) => {
  await signInAs(context, BASE);
  await page.goto("/alpha-note");
  await page.getByRole("link", { name: "Edit", exact: true }).click();

  await expect(page).toHaveURL(/\/edit\/alpha-note$/);
  await expect(page.getByTestId("note-editor")).toBeVisible();
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
