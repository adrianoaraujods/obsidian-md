import path from "node:path";
import mdx from "fumadocs-mdx/vite";
import { defineConfig } from "vitest/config";

// Unit tests read the fixture Vault, like the browser tests (see tests/README.md).
process.env.VAULT_DIR = "tests/fixtures/vault";

export default defineConfig(async () => ({
  plugins: [mdx(await import("./source.config"))],
  resolve: {
    alias: {
      "@": path.resolve("src"),
      "fumadocs-mdx:collections": path.resolve(".source"),
    },
  },
  test: { include: ["src/**/*.test.{ts,tsx}"], passWithNoTests: true },
}));
