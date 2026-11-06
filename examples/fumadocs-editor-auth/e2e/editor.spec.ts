import { expect, type Page, test } from "@playwright/test";

import { FAKE_GITHUB_URL, PROD_PORT } from "./support/config";
import { signInAs } from "./support/sign-in";

const BASE = `http://localhost:${PROD_PORT}`;
// The Note's path in the fake repo: the Vault subdirectory plus its Vault path.
const REPO_PATH = "tests/fixtures/vault/Alpha Note.md";

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

// All tests share one fake repo, so they run one at a time and start from a
// fresh copy of the fixture Vault.
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ context }) => {
  await control("reset", {});
  await signInAs(context, BASE);
});

async function openEditor(page: Page) {
  await page.goto("/edit/alpha-note");
  await expect(page.getByTestId("editor").locator(".cm-content")).toBeVisible();
  await expect(page.getByTestId("editor-loading")).toHaveCount(0);
}

async function type(page: Page, text: string) {
  await page.getByTestId("editor").locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(text);
}

test("loads the live file from GitHub, not the build", async ({ page }) => {
  await control("external-write", {
    path: "Alpha Note.md",
    content: "# Alpha Note\n\nWritten after the build.\n",
    author: { name: "Bob", login: "bob" },
  });

  await openEditor(page);

  await expect(page.getByTestId("editor")).toContainText(
    "Written after the build.",
  );
  await expect(page.getByTestId("editor")).not.toContainText(
    "Body of the alpha note.",
  );
});

test("Save shows the subject and a read-only trailer, and cancelling commits nothing", async ({
  page,
}) => {
  await openEditor(page);
  await type(page, " Edited.");
  await page.getByRole("button", { name: "Save" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("commit-subject")).toHaveValue(
    "Update Alpha Note.md",
  );
  await expect(dialog.getByTestId("commit-trailer")).toHaveValue(
    "Edited-with: obsidian-md editor\nEdited-by: The Octocat (@octocat)",
  );
  await expect(dialog.getByTestId("commit-subject")).not.toBeEditable();
  await expect(dialog.getByTestId("commit-trailer")).not.toBeEditable();

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  expect((await state()).commits).toHaveLength(0);
});

test("confirming makes one commit as described", async ({ page }) => {
  await openEditor(page);
  await type(page, " Edited.");
  await page.getByRole("button", { name: "Save" }).click();
  const dialog = page.getByRole("dialog");
  const subject = await dialog.getByTestId("commit-subject").inputValue();
  const trailer = await dialog.getByTestId("commit-trailer").inputValue();
  await dialog.getByRole("button", { name: "Commit" }).click();

  await expect(page.getByText("No changes")).toBeVisible();
  await expect.poll(async () => (await state()).commits).toHaveLength(1);
  const { commits, files } = await state();
  expect(commits[0]?.path).toBe(REPO_PATH);
  expect(commits[0]?.message).toBe(`${subject}\n\n${trailer}`);
  expect(files[REPO_PATH]).toMatch(/ Edited\.$/);
});

test("a conflict shows the banner, and Overwrite names the newer commit", async ({
  page,
}) => {
  await openEditor(page);
  await control("external-write", {
    path: "Alpha Note.md",
    content: "# Alpha Note\n\nTheirs.\n",
    author: { name: "Bob", login: "bob", date: "2026-03-04T05:06:07Z" },
  });

  await type(page, " Mine.");
  await page.getByRole("button", { name: "Save" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Commit" })
    .click();

  const banner = page.locator("[data-save-flow-banner]");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("Bob (@bob)");
  expect((await state()).commits).toHaveLength(1); // only Bob's

  await banner.getByRole("button", { name: "Overwrite" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("commit-message")).toContainText(
    "Bob (@bob) at 2026-03-04T05:06:07Z",
  );
  await dialog.getByRole("button", { name: "Overwrite" }).click();

  await expect(banner).toHaveCount(0);
  await expect.poll(async () => (await state()).commits).toHaveLength(2);
  const { files } = await state();
  expect(files[REPO_PATH]).toContain("Mine.");
});

test("a credential failure keeps the text and offers no Overwrite", async ({
  page,
}) => {
  await openEditor(page);
  await control("reject-token", { on: true });

  await type(page, " Kept.");
  await page.getByRole("button", { name: "Save" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Commit" })
    .click();

  await expect(page.getByTestId("save-error")).toHaveText(
    "Saving isn't configured correctly. Your text is kept. Tell the site owner.",
  );
  await expect(page.getByRole("button", { name: "Overwrite" })).toHaveCount(0);
  await expect(page.getByTestId("editor")).toContainText("Kept.");
  expect((await state()).commits).toHaveLength(0);
});
