import { expect, test } from "@playwright/test";

import { FAKE_GITHUB_URL, PROD_PORT } from "./support/config";
import { signInAs } from "./support/sign-in";

const BASE = `http://localhost:${PROD_PORT}`;
// Notes live under the Vault subdirectory in the fake repo.
const REPO = "tests/fixtures/vault/";

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

test.beforeEach(async ({ context }) => {
  await control("reset", {});
  await signInAs(context, BASE);
});

test("creates a Note in a chosen folder with one commit, and opens it", async ({
  page,
}) => {
  await page.goto("/edit/new?folder=Projects");
  const screen = page.getByTestId("new-note");
  await expect(screen.getByLabel("Folder")).toHaveValue("Projects");

  await screen.getByLabel("Name").fill("Fresh Idea");
  await screen.getByRole("button", { name: "Create" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Create Projects/Fresh Idea.md");
  await expect(dialog).toContainText(
    "file tree shows the old state until the next redeploy",
  );
  await expect(dialog).toContainText("no links are rewritten");
  expect((await state()).commits).toHaveLength(0);

  await dialog.getByRole("button", { name: "Create" }).click();

  await expect(page).toHaveURL(/\/edit\/projects\/fresh-idea\?new=/);
  await expect(page.getByTestId("editor").locator(".cm-content")).toBeVisible();

  await expect.poll(async () => (await state()).commits).toHaveLength(1);
  const { commits, files } = await state();
  expect(commits[0]?.path).toBe(`${REPO}Projects/Fresh Idea.md`);
  expect(commits[0]?.message).toContain("Create Projects/Fresh Idea.md");
  expect(files[`${REPO}Projects/Fresh Idea.md`]).toBeDefined();
});

test("the created Note opens locked until its commit is deployed", async ({
  page,
}) => {
  // A well-formed SHA the fake does not know: deployed, but not at the create.
  await control("build-sha", { sha: "a".repeat(40) });
  await page.goto("/edit/new");
  const screen = page.getByTestId("new-note");
  await screen.getByLabel("Name").fill("Locked Idea");
  await screen.getByRole("button", { name: "Create" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create" })
    .click();

  await expect(page).toHaveURL(/\/edit\/locked-idea\?new=/);
  await expect(page.getByTestId("lock-locked")).toBeVisible();
  await expect(page.getByTestId("editor")).toHaveAttribute("inert", "");

  await expect.poll(async () => (await state()).commits).toHaveLength(1);
  const [created] = (await state()).commits;
  await control("build-sha", { sha: (created as { sha?: string }).sha });

  await expect(page.getByTestId("lock-locked")).toHaveCount(0);
  await expect(page.getByTestId("editor")).not.toHaveAttribute("inert", "");
});

test("validates the name and refuses an existing path", async ({ page }) => {
  await page.goto("/edit/new");
  const screen = page.getByTestId("new-note");

  await screen.getByLabel("Name").fill("a:b");
  await expect(screen.getByRole("alert")).toContainText("not allowed");

  await screen.getByLabel("Name").fill("Alpha Note");
  await expect(screen.getByRole("alert")).toBeVisible();
  await screen.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // A path created after the build is unknown to the page, so only the
  // server can refuse it.
  await control("external-write", {
    path: "Later.md",
    content: "# Later\n",
    author: { name: "Bob", login: "bob" },
  });
  const before = (await state()).commits.length;
  await screen.getByLabel("Name").fill("Later");
  await screen.getByRole("button", { name: "Create" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create" })
    .click();

  await expect(page.getByTestId("create-error")).toContainText(
    "already exists",
  );
  expect((await state()).commits).toHaveLength(before);
  expect((await state()).files[`${REPO}Later.md`]).toBe("# Later\n");
});

test("New note here in the file tree menu opens the form", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("account")).toBeVisible();
  await page
    .locator("#nd-sidebar")
    .getByRole("link", { name: "Beta Note", exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "New note here" }).click();

  await expect(page).toHaveURL(/\/edit\/new$/);
  await expect(page.getByTestId("new-note").getByLabel("Name")).toBeVisible();
});

test("the editor links to New note", async ({ page }) => {
  await page.goto("/edit/alpha-note");
  await page.getByRole("link", { name: "New note" }).click();

  await expect(page).toHaveURL(/\/edit\/new$/);
});

test("a created path that does not match the slug is not found", async ({
  page,
}) => {
  const response = await page.goto("/edit/other?new=Projects%2FFresh.md");

  expect(response?.status()).toBe(404);
});
