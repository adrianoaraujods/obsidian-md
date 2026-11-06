import path from "node:path";

/**
 * Where the Vault lives. Defaults to `public/vault`; set `VAULT_DIR` to point
 * the build at another directory (the browser tests use a fixture Vault).
 */
export const vaultDir = path.resolve(
  /* turbopackIgnore: true */ process.env.VAULT_DIR ?? "public/vault",
);
