import { defineConfig } from "@playwright/test";

const PORT = 3100;

// Browser tests run against a production build of the *fixture* Vault, never
// public/vault. VAULT_DIR points the build at it (see src/lib/vault-dir.ts).
export default defineConfig({
  testDir: "e2e",
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `VAULT_DIR=tests/fixtures/vault pnpm build && pnpm start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 300_000,
    reuseExistingServer: false,
  },
});
