/**
 * The browser-safe surface of the package (ADR 0014): the micromark and
 * mdast-util extensions, the plugins, the MDAST types and the pure helpers.
 * Nothing here reaches Node built-ins, so an editor can bundle it for the
 * browser. The Node-only resolver and property-type readers stay in the main
 * entry, which re-exports everything here.
 */
export { remarkObsidianBlockIds, scanBlockIds } from "./block-id.js";
export {
  CALLOUT_ALIASES,
  CALLOUT_TYPES,
  remarkObsidianCallouts,
  resolveCalloutType,
} from "./callouts.js";
export {
  commentFromMarkdown,
  commentSyntax,
  remarkObsidianComments,
} from "./comments.js";
export {
  embedFromMarkdown,
  embedSyntax,
  remarkObsidianEmbeds,
} from "./embed.js";
export {
  footnoteFromMarkdown,
  footnoteSyntax,
  remarkObsidianFootnotes,
} from "./footnotes.js";
export type {
  FrontmatterDate,
  FrontmatterLink,
  FrontmatterValue,
  GetFrontmatterOptions,
} from "./frontmatter.js";
export { getFrontmatter } from "./frontmatter.js";
export {
  HIGHLIGHT_COLORS,
  highlightFromMarkdown,
  highlightSyntax,
  remarkObsidianHighlights,
} from "./highlights.js";
export { type MapResolverEntry, mapResolver } from "./map-resolver.js";
export { type FrontmatterSplit, splitFrontmatter } from "./note-frontmatter.js";
export { remarkObsidianMd } from "./plugin.js";
export { createSlugifyPath } from "./slugs.js";
export type {
  BlockIdsOptions,
  CalloutNode,
  CalloutPartNode,
  CalloutsPluginOptions,
  CalloutTypeDefinition,
  EmbedNode,
  EmbedsOptions,
  EmbedsPluginOptions,
  FilesystemResolver,
  NoteMetadata,
  ObsidianFootnoteNode,
  ObsidianHighlightNode,
  RemarkObsidianMdOptions,
  ResolvedTarget,
  Resolver,
  SlugifyPath,
  UnresolvedStrategy,
  UrlOptions,
  WikiLinkNode,
  WikiLinksOptions,
  WikiLinksPluginOptions,
} from "./types.js";
export type { ParsedSubpath, ParsedWikiLink } from "./utils.js";
export { parseWikiLink, slugify } from "./utils.js";
export {
  remarkObsidianWikiLinks,
  wikiLinkFromMarkdown,
  wikiLinkSyntax,
} from "./wiki-link.js";
