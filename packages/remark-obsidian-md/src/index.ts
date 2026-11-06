/**
 * The main entry: everything in the browser-safe `./syntax` entry, plus the
 * Node-only Vault readers.
 */

export {
  filesystemPropertyTypes,
  type PropertyType,
  type PropertyTypes,
} from "./property-types.js";
export {
  type DuplicatePolicy,
  type FilesystemResolverOptions,
  filesystemResolver,
} from "./resolver.js";
export * from "./syntax.js";
export { remarkObsidianMd as default } from "./syntax.js";
