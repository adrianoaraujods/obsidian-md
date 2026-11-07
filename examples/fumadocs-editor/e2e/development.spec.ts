import fs from "node:fs";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";

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

test.describe("Save UX", () => {
  async function openAndType(page: Page, text = "\nSave UX text.\n") {
    await page.goto("/edit/pong-note");
    const editor = page.locator(".cm-content");
    await expect(editor).toContainText("Back to");
    await editor.click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type(text);
    return editor;
  }

  test("Save is disabled when clean and enabled when dirty", async ({
    page,
  }) => {
    await page.goto("/edit/pong-note");
    const save = page.getByRole("button", { name: "Save" });
    const status = page.getByTestId("status");
    await expect(page.locator(".cm-content")).toContainText("Back to");
    await expect(save).toBeDisabled();
    await expect(status).toHaveText("All changes saved");

    await page.locator(".cm-content").click();
    await page.keyboard.type("x");
    await expect(save).toBeEnabled();
    await expect(status).toHaveText("Unsaved changes");
  });

  test("shows Saving… during a delayed write, then a toast with View note", async ({
    page,
  }) => {
    await page.route("**/api/storage*", async (route) => {
      if (route.request().method() !== "GET") {
        await new Promise((r) => setTimeout(r, 1000));
      }
      await route.continue();
    });
    await openAndType(page);
    const save = page.getByRole("button", { name: "Save" });
    const status = page.getByTestId("status");
    await save.click();

    await expect(status).toHaveText("Saving…");
    await expect(save).toBeDisabled();
    await expect(status).toHaveText("All changes saved");
    await expect(save).toBeDisabled();

    const toast = page.locator("[data-sonner-toast]");
    await expect(toast).toContainText("Saved Pong Note");
    await toast.getByRole("button", { name: "View note" }).click();
    await expect(page).toHaveURL(/\/pong-note$/);
  });

  test("Ctrl/Cmd+S saves with the same toast", async ({ page }) => {
    await openAndType(page);
    await page.keyboard.press("ControlOrMeta+s");

    await expect(page.locator("[data-sonner-toast]")).toContainText(
      "Saved Pong Note",
    );
    await expect(page.getByTestId("status")).toHaveText("All changes saved");
    expect(fs.readFileSync(notePath, "utf8")).toBe(
      `${original}\nSave UX text.\n`,
    );
  });

  test("Ctrl/Cmd+S saves when focus is outside the editor", async ({
    page,
  }) => {
    await openAndType(page);
    await page.getByRole("link", { name: "Back to the Note" }).focus();
    await page.keyboard.press("ControlOrMeta+s");
    await expect(page.locator("[data-sonner-toast]")).toContainText(
      "Saved Pong Note",
    );
  });

  test("leaving after a successful Save raises no unsaved-changes guard", async ({
    page,
  }) => {
    const dialogs: string[] = [];
    page.on("dialog", (d) => {
      dialogs.push(d.type());
      void d.dismiss();
    });
    await openAndType(page);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("status")).toHaveText("All changes saved");
    await page.getByRole("link", { name: "Back to the Note" }).click();
    await expect(page).toHaveURL(/\/pong-note$/);
    expect(dialogs).toEqual([]);
  });

  test("a conflict shows the banner and an error toast", async ({ page }) => {
    const editor = await openAndType(page, "My unsaved text");
    fs.writeFileSync(notePath, `${original}\nChanged elsewhere.\n`);
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.locator("[data-save-flow-banner]")).toContainText(
      "This note changed",
    );
    await expect(page.locator("[data-sonner-toast]")).toContainText(
      "Could not save Pong Note",
    );
    await expect(editor).toContainText("My unsaved text");
  });
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
