import {
  type ConstructProvider,
  inlineProviders,
  markdownProvider,
  type NoteCandidate,
  pickerExtension,
} from "codemirror-obsidian-md/editor";

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
  extensions: ReturnType<typeof pickerExtension>[];
} {
  return {
    providers: [...inlineProviders, markdownProvider],
    extensions: [pickerExtension({ candidates: options.candidates })],
  };
}
