// remark-obsidian-md emits Asset URLs as Vault-relative paths; the Vault is
// served statically, so asset srcs/hrefs get the site's static path prefix.
const ASSET_URL =
  /\.(png|jpe?g|gif|webp|svg|mp3|mp4|webm|ogv|ogg|wav|m4a|flac|pdf)$/i;

type HastNode = {
  type?: string;
  children?: HastNode[];
  properties?: Record<string, unknown>;
};

export interface RehypeVaultAssetsOptions {
  /** Static path the Vault is served under. Defaults to `/vault`. */
  base?: string;
}

export function rehypeVaultAssets(options: RehypeVaultAssetsOptions = {}) {
  const base = (options.base ?? "/vault").replace(/\/+$/, "");

  const rewrite = (node: HastNode) => {
    if (node.type === "element") {
      node.properties ??= {};
      for (const key of ["src", "href"]) {
        const url = node.properties[key];
        if (
          typeof url === "string" &&
          url.startsWith("/") &&
          ASSET_URL.test(url)
        ) {
          node.properties[key] = `${base}${url}`;
        }
      }
    }
    for (const child of node.children ?? []) rewrite(child);
  };

  return (tree: HastNode) => rewrite(tree);
}
