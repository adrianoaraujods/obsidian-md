import {
  blockIdParser,
  createEditor,
  createSaveFlow,
  inlineProviders,
  mountConflictBanner,
  type NoteCandidate,
  pickerExtension,
  type SaveFlow,
  saveFlowExtension,
} from "codemirror-obsidian-md/editor";
import { createStorageClient } from "codemirror-obsidian-md/storage/client";

export interface EditorSetupOptions {
  /** Where the editor mounts. */
  parent: HTMLElement;
  /** Where the conflict banner mounts. */
  bannerParent: HTMLElement;
  /** The Note's path relative to the Vault, e.g. `Folder/Note.md`. */
  path: string;
  /** Every Note in the Vault, for the `[[` picker. */
  candidates: NoteCandidate[];
}

/**
 * The one place the editor is assembled. Add new providers and extensions to
 * `providers` / `extensions` below. Loaded only by the edit route.
 */
export async function setupEditor(options: EditorSetupOptions) {
  const { parent, bannerParent, path, candidates } = options;
  const storage = createStorageClient({ url: "/api/storage" });
  const file = await storage.read(path);

  let getText = () => file.content;
  const flow: SaveFlow = createSaveFlow({
    storage,
    path,
    content: file.content,
    sha: file.sha,
    getText: () => getText(),
    confirm: async (request) =>
      request.kind === "save" ? true : window.confirm(request.message),
  });

  const editor = createEditor({
    parent,
    doc: file.content,
    providers: [...inlineProviders],
    parser: blockIdParser(),
    extensions: [pickerExtension({ candidates }), saveFlowExtension(flow)],
  });
  getText = editor.getText;

  const detachBeforeUnload = flow.attachBeforeUnload();
  const unmountBanner = mountConflictBanner(flow, bannerParent);
  const offReload = flow.onReload((text) =>
    editor.view.dispatch({
      changes: { from: 0, to: editor.view.state.doc.length, insert: text },
    }),
  );

  return {
    flow,
    editor,
    destroy() {
      offReload();
      unmountBanner();
      detachBeforeUnload();
      editor.destroy();
    },
  };
}
