import {
  blockIdParser,
  type ConstructProvider,
  calloutEmbed,
  editingShortcuts,
  inlineProviders,
  markdownProvider,
  type NoteCandidate,
  pickerExtension,
} from "codemirror-obsidian-md/editor";

/** Assets live in the Vault, which the Example serves from `public/vault`. */
const resolveAsset = (target: string) => `/vault/${encodeURI(target)}`;

/**
 * Everything the editor is assembled from, in one place. When more Live
 * Preview providers ship (block and embed constructs), add them to
 * `providers` here and nowhere else.
 */
export function editorSetup(options: {
  /** The Vault's Notes, for the `[[` picker. */
  candidates: readonly NoteCandidate[];
}): {
  providers: readonly ConstructProvider[];
  parser: ReturnType<typeof blockIdParser>;
  extensions: (
    | ReturnType<typeof pickerExtension>
    | ReturnType<typeof calloutEmbed>
    | ReturnType<typeof editingShortcuts>
  )[];
} {
  return {
    providers: [...inlineProviders, markdownProvider],
    parser: blockIdParser(),
    extensions: [
      pickerExtension({ candidates: options.candidates }),
      calloutEmbed({ resolveAsset }),
      editingShortcuts(),
    ],
  };
}
