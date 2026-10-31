import { createVault } from "fumadocs-obsidian-md";

import { vaultDir } from "./vault-dir";

/** Resolver, slug function and Embed reader for this Wiki's Vault. */
export const vaultConfig = createVault(vaultDir);
