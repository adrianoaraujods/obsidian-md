import { type Extension, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

import { isStaleShaError, type NewerChange } from "../storage/errors.js";
import type { Storage, StorageWriteResult } from "../storage/types.js";

export type SaveStatus = "idle" | "saving" | "conflict" | "error";

export interface SaveFlowState {
  status: SaveStatus;
  /** The text differs from the last saved (or loaded) text. */
  dirty: boolean;
  /** Set while `status` is `conflict`: who changed the Note, when known. */
  conflict: { newer: NewerChange | undefined } | null;
  /** Set while `status` is `error`. */
  error: unknown;
}

/** What the host's confirm dialog is asked to show. */
export interface SaveConfirmRequest {
  /** `save` and `overwrite` commit `text`; `reload` discards it. */
  kind: "save" | "overwrite" | "reload";
  path: string;
  /** The text that will be committed (or discarded, for `reload`). */
  text: string;
  /** Overwrite only: the newer change being replaced, when known. */
  newer?: NewerChange | undefined;
  /** Ready-to-show wording; hosts may use their own. */
  message: string;
}

export type SaveResult =
  | { ok: true; sha: string; commit?: string | undefined }
  | { ok: false; reason: "cancelled" }
  | { ok: false; reason: "conflict"; newer: NewerChange | undefined }
  | { ok: false; reason: "error"; error: unknown };

export interface SaveFlowOptions {
  storage: Storage;
  path: string;
  /** The Note's text as loaded. */
  content: string;
  /** The SHA the Note was loaded at. */
  sha: string;
  /** Current editor text (`EditorHandle.getText`). */
  getText: () => string;
  /** Host dialog. Resolve `false` to cancel. Defaults to accepting. */
  confirm?: (request: SaveConfirmRequest) => Promise<boolean>;
}

export interface SaveFlow {
  readonly state: SaveFlowState;
  /** Call on every document change (see `saveFlowExtension`). */
  textChanged(text: string): void;
  /** Confirm, then write at the current base SHA. A stale SHA enters `conflict`. */
  save(): Promise<SaveResult>;
  /** From `conflict`: refetch the base SHA, then re-run Save with a reworded dialog. */
  overwrite(): Promise<SaveResult>;
  /** Confirm, then fetch the remote text and hand it to `onReload` listeners. */
  reload(): Promise<boolean>;
  copyText(clipboard?: Pick<Clipboard, "writeText">): Promise<void>;
  /** Warn before leaving the page while dirty. Returns the detach function. */
  attachBeforeUnload(
    target?: Pick<Window, "addEventListener" | "removeEventListener">,
  ): () => void;
  subscribe(listener: (state: SaveFlowState) => void): () => void;
  /** Fires after every successful write; `commit` feeds `Storage.lock`. */
  onSaved(listener: (result: StorageWriteResult) => void): () => void;
  /** Fires with the remote text after a confirmed reload; the host sets the editor doc. */
  onReload(listener: (text: string) => void): () => void;
}

function who(newer: NewerChange | undefined): string {
  const by = newer?.author ? ` by ${newer.author}` : "";
  const at = newer?.time ? ` at ${newer.time}` : "";
  return `${by}${at}`;
}

export function createSaveFlow(options: SaveFlowOptions): SaveFlow {
  const { storage, path, getText } = options;
  const confirm = options.confirm ?? (async () => true);
  let savedText = options.content;
  let sha = options.sha;
  let busy = false;
  let state: SaveFlowState = {
    status: "idle",
    dirty: false,
    conflict: null,
    error: undefined,
  };
  const stateListeners = new Set<(s: SaveFlowState) => void>();
  const savedListeners = new Set<(r: StorageWriteResult) => void>();
  const reloadListeners = new Set<(t: string) => void>();

  function set(patch: Partial<SaveFlowState>) {
    state = { ...state, ...patch };
    for (const l of [...stateListeners]) l(state);
  }

  async function commit(
    request: SaveConfirmRequest,
    baseSha: string,
    text: string,
  ): Promise<SaveResult> {
    if (!(await confirm(request))) return { ok: false, reason: "cancelled" };
    set({ status: "saving", conflict: null, error: undefined });
    try {
      const result = await storage.write(path, text, baseSha);
      sha = result.sha;
      savedText = text;
      set({
        status: "idle",
        dirty: getText() !== savedText,
        conflict: null,
        error: undefined,
      });
      for (const l of [...savedListeners]) l(result);
      return { ok: true, sha: result.sha, commit: result.commit };
    } catch (error) {
      if (isStaleShaError(error)) {
        set({ status: "conflict", conflict: { newer: error.newer } });
        return { ok: false, reason: "conflict", newer: error.newer };
      }
      set({ status: "error", error });
      return { ok: false, reason: "error", error };
    }
  }

  async function exclusive<T>(fallback: T, run: () => Promise<T>): Promise<T> {
    if (busy) return fallback;
    busy = true;
    try {
      return await run();
    } finally {
      busy = false;
    }
  }

  const flow: SaveFlow = {
    get state() {
      return state;
    },
    textChanged(text) {
      const dirty = text !== savedText;
      if (dirty !== state.dirty) set({ dirty });
    },
    save: () =>
      exclusive<SaveResult>({ ok: false, reason: "cancelled" }, () => {
        const text = getText();
        return commit(
          {
            kind: "save",
            path,
            text,
            message: `Commit your changes to ${path}?`,
          },
          sha,
          text,
        );
      }),
    overwrite: () =>
      exclusive<SaveResult>({ ok: false, reason: "cancelled" }, async () => {
        if (state.status !== "conflict") {
          return { ok: false, reason: "cancelled" };
        }
        const newer = state.conflict?.newer;
        let fresh: { sha: string };
        try {
          fresh = await storage.read(path);
        } catch (error) {
          set({ status: "error", error });
          return { ok: false, reason: "error", error };
        }
        const text = getText();
        return commit(
          {
            kind: "overwrite",
            path,
            text,
            newer,
            message: `${path} was changed${who(newer)} after you opened it. Overwrite that version with your text?`,
          },
          fresh.sha,
          text,
        );
      }),
    reload: () =>
      exclusive(false, async () => {
        const text = getText();
        const ok = await confirm({
          kind: "reload",
          path,
          text,
          message: `Reload ${path} and discard your unsaved changes?`,
        });
        if (!ok) return false;
        const file = await storage.read(path);
        sha = file.sha;
        savedText = file.content;
        set({ status: "idle", dirty: false, conflict: null, error: undefined });
        for (const l of [...reloadListeners]) l(file.content);
        return true;
      }),
    async copyText(clipboard = navigator.clipboard) {
      await clipboard.writeText(getText());
    },
    attachBeforeUnload(target = window) {
      const handler = (event: Event) => {
        if (!state.dirty) return;
        event.preventDefault();
        (event as BeforeUnloadEvent).returnValue = "";
      };
      target.addEventListener("beforeunload", handler);
      return () => target.removeEventListener("beforeunload", handler);
    },
    subscribe(listener) {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
    onSaved(listener) {
      savedListeners.add(listener);
      return () => savedListeners.delete(listener);
    },
    onReload(listener) {
      reloadListeners.add(listener);
      return () => reloadListeners.delete(listener);
    },
  };
  return flow;
}

/**
 * CodeMirror extension wiring a SaveFlow to an editor: feeds document changes
 * into `textChanged` and binds Mod-s to Save.
 */
export function saveFlowExtension(flow: SaveFlow): Extension {
  return [
    EditorView.updateListener.of((u) => {
      if (u.docChanged) flow.textChanged(u.state.doc.toString());
    }),
    Prec.high(
      keymap.of([
        {
          key: "Mod-s",
          preventDefault: true,
          run: () => {
            void flow.save();
            return true;
          },
        },
      ]),
    ),
  ];
}

export interface ConflictBannerOptions {
  clipboard?: Pick<Clipboard, "writeText">;
}

/**
 * Framework-agnostic conflict banner: shown only while the flow is in
 * `conflict`, with Copy my text, Reload and Overwrite. Returns an unmount.
 */
export function mountConflictBanner(
  flow: SaveFlow,
  parent: HTMLElement,
  options: ConflictBannerOptions = {},
): () => void {
  let banner: HTMLElement | null = null;

  function build(): HTMLElement {
    const el = parent.ownerDocument.createElement("div");
    el.setAttribute("data-save-flow-banner", "");
    el.setAttribute("role", "alert");
    const msg = parent.ownerDocument.createElement("p");
    const newer = flow.state.conflict?.newer;
    msg.textContent = `This note changed${who(newer)} since you opened it. Your text is kept and nothing was saved.`;
    el.append(msg);
    const actions: [string, string, () => unknown][] = [
      ["copy", "Copy my text", () => flow.copyText(options.clipboard)],
      ["reload", "Reload", () => flow.reload()],
      ["overwrite", "Overwrite", () => flow.overwrite()],
    ];
    for (const [action, label, run] of actions) {
      const b = parent.ownerDocument.createElement("button");
      b.type = "button";
      b.dataset.action = action;
      b.textContent = label;
      b.addEventListener("click", () => void run());
      el.append(b);
    }
    return el;
  }

  function render(s: SaveFlowState) {
    const show = s.status === "conflict";
    if (show && !banner) {
      banner = build();
      parent.append(banner);
    } else if (!show && banner) {
      banner.remove();
      banner = null;
    }
  }

  render(flow.state);
  const off = flow.subscribe(render);
  return () => {
    off();
    banner?.remove();
    banner = null;
  };
}
