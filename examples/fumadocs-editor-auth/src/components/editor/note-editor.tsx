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
  type SaveLock,
  saveFlowExtension,
} from "codemirror-obsidian-md/editor";
import { createStorageClient } from "codemirror-obsidian-md/storage/client";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import { type CommitEditor, commitPreview } from "@/lib/commit-preview";
import { editorSetup } from "@/lib/editor-setup";
import type { LockTimings } from "@/lib/lock-timings";
import { saveErrorMessage } from "@/lib/save-errors";
import { statusLabel } from "@/lib/save-status";
import { CommitDialog, type PendingConfirm } from "./commit-dialog";
import { DeployLockPanel, startDeployLock, useLockState } from "./deploy-lock";
import { useSaveToasts } from "./use-save-toasts";

type Props = {
  /** The Note's path in the Vault, e.g. `Folder/Note.md`. */
  path: string;
  title: string;
  /** The verified editor, named in the commit's trailer. */
  editor: CommitEditor;
  candidates: NoteCandidate[];
  /** Deploy lock poll timings; the defaults suit a real deploy. */
  lockTimings?: LockTimings;
  /** Open locked on this commit until it is deployed (a just-created Note). */
  lockedCommit?: string;
  /** The Note's page, for the "View note" action once it is deployed. */
  viewHref: string;
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
export function NoteEditor({
  path,
  title,
  editor,
  candidates,
  lockTimings,
  lockedCommit,
  viewHref,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const banner = useRef<HTMLDivElement>(null);
  const flowRef = useRef<SaveFlow | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [state, setState] = useState<SaveFlowState>(idle);
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [lock, setLock] = useState<SaveLock | null>(null);
  const [savedHere, setSavedHere] = useState(false);
  const lockState = useLockState(lock);
  // Read when the editor mounts. Keeping them out of the effect's deps means a
  // re-render with new object identities never reloads the Note and loses text.
  const latest = useRef({ editor, candidates, lockTimings, lockedCommit });
  useEffect(() => {
    latest.current = { editor, candidates, lockTimings, lockedCommit };
  });
  const toasts = useSaveToasts(path, title, viewHref);

  useEffect(() => {
    let cancelled = false;
    let handle: EditorHandle | null = null;
    let offBanner = () => {};
    let offUnload = () => {};
    let offState = () => {};
    let offReload = () => {};
    let offSaved = () => {};
    let offToasts = () => {};
    let offLock = () => {};
    let saveLock: SaveLock | null = null;

    const storage = createStorageClient({ url: "/api/notes", lock: true });

    const confirm = (request: SaveConfirmRequest) =>
      new Promise<boolean>((resolve) => {
        setPending({
          request,
          preview:
            request.kind === "reload"
              ? null
              : commitPreview(path, latest.current.editor),
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
          candidates: latest.current.candidates,
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
          parser: setup.parser,
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
        offToasts = toasts.watchFlow(flow, () => saveLock);
        offSaved = flow.onSaved(() => setSavedHere(true));
        void startDeployLock(
          flow,
          storage,
          latest.current.lockTimings,
          undefined,
          latest.current.lockedCommit,
        ).then((started) => {
          if (cancelled) return started.dispose();
          saveLock = started;
          setLock(started);
          offLock = toasts.watchLock(started);
        });
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
      offSaved();
      offToasts();
      offLock();
      toasts.dismiss();
      saveLock?.dispose();
      setLock(null);
      handle?.destroy();
      flowRef.current = null;
    };
  }, [path, toasts]);

  // Ctrl/Cmd+S saves from anywhere on the page. The editor binds it too and
  // marks the event handled, so a save started there is not repeated here.
  useEffect(() => {
    if (phase.kind !== "ready") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== "s"
      ) {
        return;
      }
      event.preventDefault();
      void flowRef.current?.save();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [phase.kind]);

  const saving = state.status === "saving";
  const locked = lockState.status !== "unlocked";

  return (
    <div data-testid="note-editor">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button
          disabled={phase.kind !== "ready" || !state.dirty || saving || locked}
          onClick={() => void flowRef.current?.save()}
          size="sm"
          type="button"
        >
          Save
        </Button>
        <span
          className="flex items-center gap-1.5 text-muted-foreground text-sm"
          data-testid="status"
        >
          {saving && <Spinner />}
          {statusLabel(state, lockState.status, savedHere)}
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

      <DeployLockPanel lock={lock} />
      <div className="note-editor-banner" ref={banner} />
      <div
        className="note-editor"
        data-testid="editor"
        inert={locked}
        ref={host}
      />

      {pending && <CommitDialog pending={pending} />}
    </div>
  );
}
