"use client";

import {
  createEditor,
  createSaveFlow,
  type EditorHandle,
  mountConflictBanner,
  type NoteCandidate,
  type SaveConfirmRequest,
  type SaveFlow,
  type SaveFlowState,
  saveFlowExtension,
} from "codemirror-obsidian-md/editor";
import { createStorageClient } from "codemirror-obsidian-md/storage/client";
import { useEffect, useRef, useState } from "react";

import { type CommitEditor, commitPreview } from "@/lib/commit-preview";
import { editorSetup } from "@/lib/editor-setup";
import { saveErrorMessage } from "@/lib/save-errors";
import { CommitDialog, type PendingConfirm } from "./commit-dialog";

type Props = {
  /** The Note's path in the Vault, e.g. `Folder/Note.md`. */
  path: string;
  title: string;
  /** The verified editor, named in the commit's trailer. */
  editor: CommitEditor;
  candidates: NoteCandidate[];
};

type Phase =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "failed"; error: unknown };

const idle: SaveFlowState = {
  status: "idle",
  dirty: false,
  conflict: null,
  error: undefined,
};

/**
 * The Note's editor: loads the live file and its SHA from GitHub (through
 * `/api/notes`, never the build), and saves behind a confirmation dialog that
 * shows the commit. A conflict shows the banner; a failed credential shows a
 * message that keeps the text and offers no Overwrite.
 */
export function NoteEditor({ path, title, editor, candidates }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const banner = useRef<HTMLDivElement>(null);
  const flowRef = useRef<SaveFlow | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [state, setState] = useState<SaveFlowState>(idle);
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  // Read when the editor mounts. Keeping them out of the effect's deps means a
  // re-render with new object identities never reloads the Note and loses text.
  const props = useRef({ editor, candidates });
  useEffect(() => {
    props.current = { editor, candidates };
  });

  useEffect(() => {
    let cancelled = false;
    let handle: EditorHandle | null = null;
    let offBanner = () => {};
    let offUnload = () => {};
    let offState = () => {};
    let offReload = () => {};

    const storage = createStorageClient({ url: "/api/notes" });

    const confirm = (request: SaveConfirmRequest) =>
      new Promise<boolean>((resolve) => {
        setPending({
          request,
          preview:
            request.kind === "reload"
              ? null
              : commitPreview(path, props.current.editor),
          resolve: (answer) => {
            setPending(null);
            resolve(answer);
          },
        });
      });

    storage.read(path).then(
      (file) => {
        if (cancelled || !host.current || !banner.current) return;
        const setup = editorSetup({
          candidates: props.current.candidates,
        });
        // The flow needs the handle's text and the handle needs the flow's
        // extension, so the flow reads through this late-bound getter.
        const flow = createSaveFlow({
          storage,
          path,
          content: file.content,
          sha: file.sha,
          getText: () => handle?.getText() ?? file.content,
          confirm,
        });
        flowRef.current = flow;
        handle = createEditor({
          parent: host.current,
          doc: file.content,
          providers: setup.providers,
          extensions: [...setup.extensions, saveFlowExtension(flow)],
        });
        offReload = flow.onReload((text) => {
          const view = handle?.view;
          view?.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: text },
          });
        });
        offBanner = mountConflictBanner(flow, banner.current);
        offUnload = flow.attachBeforeUnload();
        offState = flow.subscribe(setState);
        setPhase({ kind: "ready" });
      },
      (error) => {
        if (!cancelled) setPhase({ kind: "failed", error });
      },
    );

    return () => {
      cancelled = true;
      offBanner();
      offUnload();
      offState();
      offReload();
      handle?.destroy();
      flowRef.current = null;
    };
  }, [path]);

  const saving = state.status === "saving";

  return (
    <div data-testid="note-editor">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          className="rounded-md border border-fd-primary bg-fd-primary px-3 py-1.5 font-medium text-fd-primary-foreground text-sm disabled:opacity-50"
          disabled={phase.kind !== "ready" || !state.dirty || saving}
          onClick={() => void flowRef.current?.save()}
          type="button"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <span className="text-fd-muted-foreground text-sm">
          {state.dirty ? "Unsaved changes" : "No changes"}
        </span>
      </div>

      {phase.kind === "loading" && (
        <p data-testid="editor-loading">Loading {title} from GitHub…</p>
      )}
      {phase.kind === "failed" && (
        <p data-testid="editor-error" role="alert">
          {saveErrorMessage(phase.error)}
        </p>
      )}
      {state.status === "error" && (
        <p data-testid="save-error" role="alert">
          {saveErrorMessage(state.error)}
        </p>
      )}

      <div className="note-editor-banner" ref={banner} />
      <div className="note-editor" data-testid="editor" ref={host} />

      {pending && <CommitDialog pending={pending} />}
    </div>
  );
}
