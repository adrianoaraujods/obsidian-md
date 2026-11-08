import { expect, type Page, test } from "@playwright/test";

import { FAKE_GITHUB_URL, PROD_PORT } from "./support/config";
import { signInAs } from "./support/sign-in";

// The Manager commits to the fake GitHub repo, so these tests read the repo
// (`/__test/state`) where the open Example's read the Vault on disk. The page
// shows the deployed Vault, which is the fixture the production build read, so
// moving a Note never changes what the next test sees.
const BASE = `http://localhost:${PROD_PORT}`;
const REPO = "tests/fixtures/vault/";
const F = "Manager Fixture";

const control = (path: string, body?: unknown) =>
  fetch(`${FAKE_GITHUB_URL}/__test/${path}`, {
    method: body === undefined ? "GET" : "POST",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }).then((response) => response.json());

type RepoState = {
  files: Record<string, string>;
  commits: { sha: string; message: string; paths: string[] }[];
};
const state = () => control("state") as Promise<RepoState>;

test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ page, context }) => {
  await control("reset", {});
  await signInAs(context, BASE);
  // Tall enough that a drag never starts dnd-kit's autoscroll at the viewport edge.
  await page.setViewportSize({ width: 1280, height: 1600 });
});

async function openManager(page: Page) {
  await page.goto("/manage");
  await expect(row(page, `${F}/Rename Me.md`)).toBeVisible();
  await expect(row(page, `${F}/Pick Me.md`)).toBeVisible();
}

/** Whether the repo holds a file at `rel`, or a folder with files under it. */
async function onRepo(rel: string) {
  const { files } = await state();
  return Object.keys(files).some(
    (file) => file === REPO + rel || file.startsWith(`${REPO}${rel}/`),
  );
}

async function read(rel: string) {
  const content = (await state()).files[REPO + rel];
  if (content === undefined) throw new Error(`${rel} is not in the repo`);
  return content;
}

const P = (name: string) => `${F}/${name}`;
const row = (page: Page, notePath: string) =>
  page.locator(`[data-path="${notePath}"]`);
const toast = (page: Page) => page.locator("[data-sonner-toast]");

async function rename(page: Page, notePath: string, to: string) {
  await page.getByRole("button", { name: `Rename ${notePath}` }).click();
  const input = page.getByRole("textbox", {
    name: `New name for ${notePath}`,
  });
  await input.fill(to);
  await input.press("Enter");
}

/** Drag the item at `itemPath` onto a folder with real mouse events. */
async function dragOnto(page: Page, itemPath: string, folder: string) {
  const handle = page.getByRole("button", {
    name: `Drag ${itemPath}`,
    exact: true,
  });
  const target = page.locator(`[data-folder="${folder}"]`);
  await target.scrollIntoViewIfNeeded();
  await handle.scrollIntoViewIfNeeded();
  const box = async (l: typeof handle) => {
    const b = await l.boundingBox();
    if (!b) throw new Error("not visible");
    return b;
  };
  const from = await box(handle);
  const to = await box(target);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + 20, to.y + to.height / 2, { steps: 10 });
  await page.mouse.up();
}

async function moveTo(page: Page, itemPath: string, folder: string) {
  await page
    .getByRole("button", { name: `Move to… ${itemPath}`, exact: true })
    .click();
  const input = page.getByRole("textbox", {
    name: `Folder for ${itemPath}`,
    exact: true,
  });
  await input.fill(folder);
  await input.press("Enter");
}

async function apply(page: Page) {
  const dialog = page.getByRole("dialog");
  // dnd-kit swallows the first click right after a drop, so retry it.
  await expect(async () => {
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(dialog.getByTestId("commit-subject")).toBeVisible({
      timeout: 1000,
    });
  }).toPass();
  await dialog.getByRole("button", { name: "Commit" }).click();
}

test("renders the deployed Vault as a tree", async ({ page }) => {
  await openManager(page);
  await expect(row(page, P("Docs/Guide.md"))).toBeVisible();
  await expect(page.getByText("No pending changes")).toBeVisible();
});

test("dragging a Note onto a folder stages a move and Apply commits it", async ({
  page,
}) => {
  await openManager(page);
  await dragOnto(page, P("Pick Me.md"), P("Docs"));

  await expect(page.getByTestId("pending")).toContainText(
    `Move ${P("Pick Me.md")} → ${P("Docs/Pick Me.md")}`,
  );
  expect(await onRepo(P("Pick Me.md"))).toBe(true);

  await apply(page);

  await expect(toast(page)).toContainText("Committed");
  await expect(row(page, P("Docs/Pick Me.md"))).toBeVisible();
  expect(await onRepo(P("Docs/Pick Me.md"))).toBe(true);
  expect(await onRepo(P("Pick Me.md"))).toBe(false);
});

test("Move to… moves a Note with the keyboard only", async ({ page }) => {
  await openManager(page);
  await page
    .getByRole("button", { name: `Move to… ${P("Drag Me.md")}` })
    .focus();
  await page.keyboard.press("Enter");
  const input = page.getByRole("textbox", {
    name: `Folder for ${P("Drag Me.md")}`,
  });
  await expect(input).toBeFocused();
  await page.keyboard.type(P("Archive"));
  await page.keyboard.press("Enter");

  await expect(page.getByTestId("pending")).toContainText(
    `Move ${P("Drag Me.md")} → ${P("Archive/Drag Me.md")}`,
  );
  await page.getByRole("button", { name: "Apply" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Commit" }).focus();
  await page.keyboard.press("Enter");

  await expect(toast(page)).toContainText("Committed");
  await expect(row(page, P("Archive/Drag Me.md"))).toBeVisible();
  expect(await onRepo(P("Archive/Drag Me.md"))).toBe(true);
  expect(await onRepo(P("Drag Me.md"))).toBe(false);
});

test("renaming a Note stages a Rename and commits it", async ({ page }) => {
  await openManager(page);
  await rename(page, P("Rename Me.md"), "Renamed");

  await expect(page.getByTestId("pending")).toContainText(
    `Rename ${P("Rename Me.md")} → ${P("Renamed.md")}`,
  );
  await apply(page);

  await expect(toast(page)).toContainText("Committed");
  await expect(row(page, P("Renamed.md"))).toBeVisible();
  expect(await onRepo(P("Renamed.md"))).toBe(true);
  expect(await onRepo(P("Rename Me.md"))).toBe(false);
});

test("the confirm dialog shows the commit subject, body and trailer", async ({
  page,
}) => {
  await openManager(page);
  await rename(page, P("Rename Me.md"), "Renamed");
  await page.getByRole("button", { name: "Apply" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("commit-subject")).toHaveValue(
    `Rename ${P("Rename Me.md")}`,
  );
  await expect(dialog.getByTestId("commit-body")).toHaveValue(
    `- Rename ${P("Rename Me.md")} → ${P("Renamed.md")}`,
  );
  await expect(dialog.getByTestId("commit-trailer")).toHaveValue(
    /Edited-with: obsidian-md editor/,
  );
  await expect(dialog).toContainText("will not redirect");
  expect(await onRepo(P("Rename Me.md"))).toBe(true);
});

test("per-change undo and discard all", async ({ page }) => {
  await openManager(page);
  await rename(page, P("Rename Me.md"), "One");
  await rename(page, P("Pick Me.md"), "Two");
  const pending = page.getByTestId("pending");
  await expect(pending).toContainText(`${P("Rename Me.md")} → ${P("One.md")}`);
  await expect(pending).toContainText(`${P("Pick Me.md")} → ${P("Two.md")}`);

  await page
    .getByRole("button", { name: `Undo Rename ${P("Rename Me.md")}` })
    .click();
  await expect(pending).not.toContainText("One.md");
  await expect(pending).toContainText("Two.md");

  await page.getByRole("button", { name: "Discard all" }).click();
  await expect(page.getByText("No pending changes")).toBeVisible();
  await expect(row(page, P("Pick Me.md"))).toBeVisible();
});

test("refuses a name that is taken, or that clashes in case, and stages nothing", async ({
  page,
}) => {
  await openManager(page);
  await rename(page, P("Rename Me.md"), "Pick Me");
  await expect(page.getByTestId("error")).toContainText("already exists");

  const input = page.getByRole("textbox", {
    name: `New name for ${P("Rename Me.md")}`,
  });
  await input.fill("pick me");
  await input.press("Enter");
  await expect(page.getByTestId("error")).toContainText("only in case");

  await input.fill("../Escape");
  await input.press("Enter");
  await expect(page.getByTestId("error")).toContainText('".."');
  await expect(page.getByText("No pending changes")).toBeVisible();
});

test("renaming a Note rewrites the links to it in another Note", async ({
  page,
}) => {
  await openManager(page);
  await rename(page, P("Link Target.md"), "Link Renamed");

  await expect(page.getByTestId("rewrites")).toContainText(
    `${P("Linker.md")}: 5 links`,
  );
  await expect(page.getByTestId("urls")).toContainText(
    "/manager-fixture/link-target → /manager-fixture/link-renamed",
  );
  await page.getByRole("button", { name: "Apply" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("will not redirect");
  await expect(dialog.getByTestId("commit-body")).toHaveValue(
    [
      `- Rename ${P("Link Target.md")} → ${P("Link Renamed.md")}`,
      `- Update 5 link(s) in ${P("Linker.md")}`,
    ].join("\n"),
  );
  expect(await read(P("Linker.md"))).toContain("[[Link Target]]");
  await dialog.getByRole("button", { name: "Commit" }).click();

  await expect(toast(page)).toContainText("Committed");
  expect(await read(P("Linker.md"))).toBe(
    [
      "---",
      "title: Linker",
      'up: "[[Link Renamed]]"',
      "---",
      "",
      "# Linker",
      "",
      "See [[Link Renamed]], [[Link Renamed#Heading|the heading]] and a [Markdown link](Link%20Renamed.md#Heading).",
      "",
      "![[Link Renamed]]",
      "",
    ].join("\n"),
  );
  expect(await onRepo(P("Link Renamed.md"))).toBe(true);
  expect(await onRepo(P("Link Target.md"))).toBe(false);
});

test("dragging a folder moves everything in it and rewrites the links to it", async ({
  page,
}) => {
  await openManager(page);
  await dragOnto(page, P("Movable Folder"), P("Docs"));

  await expect(page.getByTestId("pending")).toContainText(
    `Move ${P("Movable Folder")} → ${P("Docs/Movable Folder")}`,
  );
  await expect(page.getByTestId("rewrites")).toContainText(
    `${P("Folder Linker.md")}: 1 link`,
  );
  await page.getByRole("button", { name: "Apply" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("commit-subject")).toHaveValue(
    `Move ${P("Movable Folder")}`,
  );
  await expect(dialog.getByTestId("commit-body")).toHaveValue(
    [
      `- Move ${P("Movable Folder")} → ${P("Docs/Movable Folder")}`,
      `- Update 1 link(s) in ${P("Folder Linker.md")}`,
    ].join("\n"),
  );
  await dialog.getByRole("button", { name: "Commit" }).click();

  await expect(toast(page)).toContainText("Committed");
  await expect(row(page, P("Docs/Movable Folder/Inside.md"))).toBeVisible();
  await expect(
    row(page, P("Docs/Movable Folder/Deep/Deeper.md")),
  ).toBeVisible();
  expect(await onRepo(P("Docs/Movable Folder/Inside.md"))).toBe(true);
  expect(await onRepo(P("Docs/Movable Folder/Deep/Deeper.md"))).toBe(true);
  expect(await onRepo(P("Movable Folder/Inside.md"))).toBe(false);
  expect(await onRepo(P("Movable Folder"))).toBe(false);
  // A path-style link follows the folder; a bare name still resolves.
  expect(await read(P("Folder Linker.md"))).toContain(
    `[[${P("Docs/Movable Folder/Inside")}|inside]] and [[Deeper]]`,
  );
});

test("moving and renaming an Asset rewrites the Embeds of it", async ({
  page,
}) => {
  await openManager(page);
  await moveTo(page, P("Pics/diagram.png"), P("Archive"));
  await rename(page, P("Archive/diagram.png"), "schema.png");

  await expect(page.getByTestId("rewrites")).toContainText(
    `${P("Asset Embedder.md")}: 1 link`,
  );
  await page.getByRole("button", { name: "Apply" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("commit-subject")).toHaveValue(
    `Move ${P("Pics/diagram.png")}`,
  );
  await dialog.getByRole("button", { name: "Commit" }).click();

  await expect(toast(page)).toContainText("Committed");
  await expect(row(page, P("Archive/schema.png"))).toBeVisible();
  expect(await onRepo(P("Archive/schema.png"))).toBe(true);
  expect(await onRepo(P("Pics/diagram.png"))).toBe(false);
  expect(await read(P("Asset Embedder.md"))).toContain("![[schema.png|100]]");
});

test("a new folder exists once something is moved into it", async ({
  page,
}) => {
  await openManager(page);
  await page.getByRole("textbox", { name: "New folder" }).fill(P("Fresh"));
  await page.getByRole("button", { name: "Add folder" }).click();
  await expect(page.getByTestId("new-folders")).toContainText(P("Fresh"));
  await expect(page.locator(`[data-folder="${P("Fresh")}"]`)).toBeVisible();

  await dragOnto(page, P("Pick Me.md"), P("Fresh"));
  await expect(page.getByTestId("pending")).toContainText(
    `Move ${P("Pick Me.md")} → ${P("Fresh/Pick Me.md")}`,
  );
  await expect(page.getByTestId("new-folders")).toHaveCount(0);
  expect(await onRepo(P("Fresh"))).toBe(false);
  await apply(page);

  await expect(toast(page)).toContainText("Committed");
  expect(await onRepo(P("Fresh/Pick Me.md"))).toBe(true);
});

test("a new folder left empty is dropped on Apply", async ({ page }) => {
  await openManager(page);
  await page.getByRole("textbox", { name: "New folder" }).fill(P("Empty"));
  await page.getByRole("button", { name: "Add folder" }).click();
  await rename(page, P("Rename Me.md"), "Renamed");
  await apply(page);

  await expect(toast(page)).toContainText("Committed");
  expect(await onRepo(P("Renamed.md"))).toBe(true);
  expect(await onRepo(P("Empty"))).toBe(false);
  await expect(page.locator(`[data-folder="${P("Empty")}"]`)).toHaveCount(0);
});

test("refuses a new folder that exists, and a folder moved into itself", async ({
  page,
}) => {
  await openManager(page);
  const input = page.getByRole("textbox", { name: "New folder" });
  await input.fill(P("Docs"));
  await input.press("Enter");
  await expect(page.getByTestId("error")).toContainText("already exists");

  await moveTo(page, P("Movable Folder"), P("Movable Folder/Deep"));
  await expect(page.getByTestId("error")).toContainText("itself");
  await expect(page.getByText("No pending changes")).toBeVisible();
});

/** Drag an item or Separator onto a gap between rows with real mouse events. */
async function dragToSlot(page: Page, label: string, slot: string) {
  const handle = page.getByRole("button", {
    name: `Drag ${label}`,
    exact: true,
  });
  const target = page.locator(`[data-slot="${slot}"]`);
  await target.scrollIntoViewIfNeeded();
  await handle.scrollIntoViewIfNeeded();
  const [from, to] = await Promise.all([
    handle.boundingBox(),
    target.boundingBox(),
  ]);
  if (!from || !to) throw new Error("not visible");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y + 20, { steps: 4 });
  await page.mouse.move(to.x + 60, to.y + to.height / 2, { steps: 10 });
  await page.mouse.up();
}

const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });

const ORDERED = P("Ordered");
const pages = async (folder: string) =>
  (JSON.parse(await read(`${folder}/meta.json`)) as { pages: string[] }).pages;

test("moving a Note up creates a meta.json with the current order, ending with '...'", async ({
  page,
}) => {
  await openManager(page);
  await button(page, `Move up ${P("Rename Me.md")}`).click();
  await expect(page.getByTestId("pending")).toContainText(
    `Reorder items in ${F}`,
  );
  expect(await onRepo(P("meta.json"))).toBe(false);
  await apply(page);

  await expect(toast(page)).toContainText("Committed");
  const order = await pages(F);
  expect(order.at(-1)).toBe("...");
  expect(order.indexOf("Rename Me")).toBeLessThan(order.indexOf("Pick Me"));
  // Folders stay listed, ahead of the Notes.
  expect(order.indexOf("Docs")).toBeLessThan(order.indexOf("Asset Embedder"));
  // The row moved in the tree at once, before any redeploy.
  const rows = await page
    .locator(`[data-path^="${F}/"]`)
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-path")));
  expect(rows.indexOf(P("Rename Me.md"))).toBeLessThan(
    rows.indexOf(P("Pick Me.md")),
  );
});

test("reorders the top level too", async ({ page }) => {
  await openManager(page);
  await button(page, "Move up index.md").click();
  await apply(page);

  await expect(toast(page)).toContainText("Committed");
  const order = (JSON.parse(await read("meta.json")) as { pages: string[] })
    .pages;
  expect(order.at(-1)).toBe("...");
  expect(order.indexOf("index")).toBeLessThan(order.indexOf("Beta Note"));
});

test("dragging a Note between two others reorders them and keeps what meta.json holds", async ({
  page,
}) => {
  await openManager(page);
  await dragToSlot(page, P("Ordered/First.md"), `${ORDERED}#0`);

  await expect(page.getByTestId("pending")).toContainText(
    `Reorder items in ${ORDERED}`,
  );
  await apply(page);
  await expect(toast(page)).toContainText("Committed");
  expect(JSON.parse(await read(P("Ordered/meta.json")))).toEqual({
    icon: "list",
    defaultOpen: true,
    pages: [
      "First",
      "Third",
      "---Old label---",
      "[Docs](https://example.com)",
      "Second",
    ],
  });
});

test("adds, renames and drags under a Separator, and edits a folder's title", async ({
  page,
}) => {
  await openManager(page);
  await button(page, `Add Separator in ${ORDERED}`).click();
  const title = page.getByRole("textbox", {
    name: `Separator title in ${ORDERED}`,
  });
  await title.fill("Extras");
  await title.press("Enter");
  await expect(page.getByTestId("pending")).toContainText(
    'Add Separator "Extras"',
  );

  await button(page, "Rename Separator Old label").click();
  const renamed = page.getByRole("textbox", {
    name: "New title for Separator Old label",
  });
  await renamed.fill("Basics");
  await renamed.press("Enter");

  // Third goes to the end, under the new Separator.
  await dragToSlot(page, P("Ordered/Third.md"), `${ORDERED}#5`);

  const folderTitle = page.getByRole("textbox", {
    name: `Title of ${ORDERED}`,
  });
  // dnd-kit swallows the first click right after a drop, so retry it.
  await expect(async () => {
    await button(page, `Edit title ${ORDERED}`).click();
    await expect(folderTitle).toBeVisible({ timeout: 1000 });
  }).toPass();
  await folderTitle.fill("Ordered Notes");
  await folderTitle.press("Enter");
  await expect(page.locator(`[data-folder="${ORDERED}"]`)).toContainText(
    "Ordered Notes",
  );

  await apply(page);
  await expect(toast(page)).toContainText("Committed");
  expect(JSON.parse(await read(P("Ordered/meta.json")))).toEqual({
    title: "Ordered Notes",
    icon: "list",
    defaultOpen: true,
    pages: [
      "---Basics---",
      "First",
      "[Docs](https://example.com)",
      "Second",
      "---Extras---",
      "Third",
    ],
  });
});

test("a move keeps the pages of both folders in sync, and removing a Separator keeps its items", async ({
  page,
}) => {
  await openManager(page);
  await moveTo(page, P("Ordered/First.md"), P("Docs"));
  await moveTo(page, P("Pick Me.md"), ORDERED);
  await button(page, "Remove Separator Old label").click();
  await apply(page);

  await expect(toast(page)).toContainText("Committed");
  expect(JSON.parse(await read(P("Ordered/meta.json")))).toEqual({
    icon: "list",
    defaultOpen: true,
    pages: ["Third", "[Docs](https://example.com)", "Second", "Pick Me"],
  });
  expect(await onRepo(P("Docs/First.md"))).toBe(true);
  expect(await onRepo(P("Ordered/Pick Me.md"))).toBe(true);
  // Docs had no meta.json, so none is made just for the move.
  expect(await onRepo(P("Docs/meta.json"))).toBe(false);
});

test.describe("signed in and signed out", () => {
  test("a signed-out visitor is sent to sign-in and returns to the Manager", async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    await page.goto("/manage");

    await expect(page).toHaveURL(/\/login\/oauth\/authorize/);
    await page.getByRole("link", { name: "Authorize as octocat" }).click();

    await expect(page).toHaveURL(`${BASE}/manage`);
    await expect(row(page, P("Rename Me.md"))).toBeVisible();
    await expect(page.getByTestId("account")).toContainText("@octocat");
  });

  test("cancelling sign-in lands on the read-only Wiki", async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    await page.goto("/manage");
    await page.getByRole("link", { name: "Cancel" }).click();

    await expect(page).toHaveURL(`${BASE}/`);
    await expect(page.getByTestId("account")).toHaveCount(0);
  });

  test("the commit route refuses a signed-out request", async ({
    request,
    context,
  }) => {
    await context.clearCookies();
    const response = await request.post(`${BASE}/api/manage`, {
      data: { base: "x", changeset: [] },
    });
    expect(response.status()).toBe(401);
    expect((await state()).commits).toHaveLength(0);
  });
});

test("Apply makes one commit whose trailer comes from the session", async ({
  page,
}) => {
  await openManager(page);
  await rename(page, P("Link Target.md"), "Link Renamed");
  await page.getByRole("button", { name: "Apply" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("commit-trailer")).toHaveValue(
    "Edited-with: obsidian-md editor\nEdited-by: The Octocat (@octocat)",
  );
  const before = (await state()).commits.length;
  await dialog.getByRole("button", { name: "Commit" }).click();
  await expect(toast(page)).toContainText("Committed");

  const { commits } = await state();
  expect(commits).toHaveLength(before + 1);
  expect(commits.at(-1)?.message).toBe(
    [
      `Rename ${P("Link Target.md")}`,
      "",
      `- Rename ${P("Link Target.md")} → ${P("Link Renamed.md")}`,
      `- Update 5 link(s) in ${P("Linker.md")}`,
      "",
      "Edited-with: obsidian-md editor",
      "Edited-by: The Octocat (@octocat)",
    ].join("\n"),
  );
  // The Note moved and its links were rewritten in that one commit.
  expect(commits.at(-1)?.paths).toEqual(
    expect.arrayContaining([
      `${REPO}${P("Link Target.md")}`,
      `${REPO}${P("Link Renamed.md")}`,
      `${REPO}${P("Linker.md")}`,
    ]),
  );
});

test("a refused credential keeps the staged changes and a retry works", async ({
  page,
}) => {
  await openManager(page);
  await rename(page, P("Rename Me.md"), "Renamed");
  await control("reject-token", { on: true });
  const before = (await state()).commits.length;

  await apply(page);

  await expect(page.getByTestId("apply-error")).toHaveText(
    "Applying isn't configured correctly. Your staged changes are kept. Tell the site owner.",
  );
  await expect(page.getByTestId("pending")).toContainText(
    `Rename ${P("Rename Me.md")} → ${P("Renamed.md")}`,
  );
  await expect(row(page, P("Rename Me.md"))).toHaveCount(0);
  expect((await state()).commits).toHaveLength(before);

  await control("reject-token", { on: false });
  await apply(page);
  await expect(toast(page)).toContainText("Committed");
  await expect(page.getByTestId("apply-error")).toHaveCount(0);
  expect(await onRepo(P("Renamed.md"))).toBe(true);
  expect(await onRepo(P("Rename Me.md"))).toBe(false);
});

test("a commit that landed meanwhile keeps the staged changes and asks to reload", async ({
  page,
}) => {
  await openManager(page);
  await rename(page, P("Rename Me.md"), "Renamed");
  await control("external-write", {
    path: P("Pick Me.md"),
    content: "Changed by somebody else.",
    author: { name: "Bob", login: "bob" },
  });

  await apply(page);

  await expect(toast(page)).toContainText("The Vault changed");
  await expect(page.getByTestId("pending")).toContainText(
    `Rename ${P("Rename Me.md")}`,
  );
  expect(await onRepo(P("Rename Me.md"))).toBe(true);
  expect(await onRepo(P("Renamed.md"))).toBe(false);
});
