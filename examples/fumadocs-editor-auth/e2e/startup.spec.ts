import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";
import { expect, test } from "@playwright/test";

import { STARTUP_PORT } from "./support/config";

// These start their own `next start` against the production build the
// "production" project already made, with a deliberately bad environment.

const NEXT_BIN = path.join(process.cwd(), "node_modules/next/dist/bin/next");

function start(env: Record<string, string>) {
  const output: string[] = [];
  const child = spawn(
    process.execPath,
    [NEXT_BIN, "start", "-p", String(STARTUP_PORT)],
    {
      env: {
        NODE_ENV: "production",
        // `next start` regenerates .source; keep it pointing at the fixtures.
        VAULT_DIR: "tests/fixtures/vault",
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout?.on("data", (chunk) => output.push(String(chunk)));
  child.stderr?.on("data", (chunk) => output.push(String(chunk)));
  return { child, output: () => output.join("") };
}

async function waitFor(check: () => boolean | Promise<boolean>) {
  await expect.poll(check, { timeout: 60_000 }).toBe(true);
}

const exited = (child: ChildProcess) => child.exitCode !== null;

test("production refuses to start without GITHUB_REPO", async () => {
  const { child, output } = start({});
  try {
    await waitFor(() => exited(child));
    expect(child.exitCode).not.toBe(0);
    expect(output()).toContain("GITHUB_REPO");
  } finally {
    child.kill();
  }
});

test("a bad environment gives one readable error at the first request", async ({
  request,
}) => {
  const { child, output } = start({ GITHUB_REPO: "acme/wiki" });
  try {
    const base = `http://localhost:${STARTUP_PORT}`;
    // Pages read at build time need no secrets, so the Wiki itself is up.
    await waitFor(async () => {
      try {
        return (await request.get(`${base}/alpha-note`)).ok();
      } catch {
        return false;
      }
    });

    const response = await request.get(`${base}/api/auth/get-session`);
    expect(response.ok()).toBe(false);
    await waitFor(() => output().includes("BETTER_AUTH_SECRET"));

    const log = output();
    for (const name of [
      "BETTER_AUTH_SECRET",
      "BETTER_AUTH_URL",
      "GITHUB_CLIENT_ID",
      "GITHUB_CLIENT_SECRET",
      "GITHUB_TOKEN",
    ]) {
      expect(log).toContain(name);
    }
  } finally {
    child.kill();
  }
});
