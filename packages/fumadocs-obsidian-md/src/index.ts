export {
  findUnparseableFrontmatter,
  type UnparseableFrontmatter,
} from "./check-frontmatter.js";
export {
  type CreateMdxOptionsConfig,
  createMdxOptions,
} from "./mdx-options.js";
export { buildPreviewPayload } from "./preview-payload.js";
export {
  type RehypeVaultAssetsOptions,
  rehypeVaultAssets,
} from "./rehype-vault-assets.js";
export { createVault, type Vault } from "./vault.js";
export { createVaultLink } from "./vault-link.js";
export {
  resolveVaultLink,
  type VaultLinkTarget,
} from "./vault-link-target.js";
export type {
  MdxComponentMap,
  VaultPage,
  VaultSource,
} from "./vault-source.js";
