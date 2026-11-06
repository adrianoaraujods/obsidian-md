import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

// Edit tests write to this fixture Note on disk; each test restores it.
const notePath = path.resolve("tests/fixtures/vault/Pong Note.md");
let original = "";
test.beforeEach(() => {
  original = fs.readFileSync(notePath, "utf8");
});
test.afterEach(() => {
  fs.writeFileSync(notePath, original);
});

test("Edit opens the raw Markdown at /edit/<slug>", async ({ page }) => {
  await page.goto("/pong-note");
  await page.getByRole("link", { name: "Edit", exact: true }).click();

  await expect(page).toHaveURL(/\/edit\/pong-note$/);
  await expect(page.locator(".cm-content")).toContainText("title: Pong Note");
});

test("typing then Save writes the file on disk", async ({ page }) => {
  await page.goto("/edit/pong-note");
  const editor = page.locator(".cm-content");
  await expect(editor).toContainText("Back to");

  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("\nTyped in the editor.\n");
  await page.getByRole("button", { name: "Save" }).click();

  await expect
    .poll(() => fs.readFileSync(notePath, "utf8"))
    .toBe(`${original}\nTyped in the editor.\n`);
});

test("a stale Save shows the conflict banner and keeps the text", async ({
  page,
}) => {
  await page.goto("/edit/pong-note");
  const editor = page.locator(".cm-content");
  await expect(editor).toContainText("Back to");

  fs.writeFileSync(notePath, `${original}\nChanged elsewhere.\n`);

  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("My unsaved text");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.locator("[data-save-flow-banner]")).toContainText(
    "This note changed",
  );
  await expect(editor).toContainText("My unsaved text");
  expect(fs.readFileSync(notePath, "utf8")).toBe(
    `${original}\nChanged elsewhere.\n`,
  );
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
