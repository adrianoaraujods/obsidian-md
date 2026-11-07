import type {
  SaveFlowState,
  SaveLockStatus,
} from "codemirror-obsidian-md/editor";

/** What a toast shows; `viewNote` adds the "View note" action. */
export type SaveToast = {
  kind: "loading" | "success" | "error";
  message: string;
  viewNote: boolean;
};

/**
 * The toolbar's status text. `savedHere` is whether this editor session has
 * made a Save, which is what tells "Saved" from a Note that was never edited.
 */
export function statusLabel(
  state: Pick<SaveFlowState, "status" | "dirty">,
  lock: SaveLockStatus,
  savedHere: boolean,
): string {
  if (state.status === "saving") return "Saving…";
  if (state.status === "conflict") return "Conflict";
  if (state.status === "error") return "Save failed";
  if (state.dirty) return "Unsaved changes";
  if (lock === "locked") return "Saved, deploying";
  return savedHere ? "Saved" : "All changes saved";
}

const WAITING_MESSAGE = "Committed. Waiting for the deploy…";

/** The toast for a Save that is committed and now waits for its deploy. */
export function waitingToast(): SaveToast {
  return { kind: "loading", message: WAITING_MESSAGE, viewNote: false };
}

/**
 * The toast change for a deploy-lock transition, or `null` for none. The
 * "View note" action only comes with "Deployed": a timeout, or a reload out of
 * one, never sends the person to a page that may be stale.
 */
export function deployToast(
  from: SaveLockStatus,
  to: SaveLockStatus,
  noteName: string,
): SaveToast | null {
  if (to === "locked" && from !== "locked") {
    return waitingToast();
  }
  if (from === "locked" && to === "unlocked") {
    return { kind: "success", message: "Deployed", viewNote: true };
  }
  if (from === "locked" && to === "timeout") {
    return {
      kind: "error",
      message: `${noteName} is saved but not live yet`,
      viewNote: false,
    };
  }
  return null;
}

/** The toast for a Save the host cannot track to a deploy. */
export function savedToast(noteName: string): SaveToast {
  return { kind: "success", message: `Saved ${noteName}`, viewNote: false };
}

/** The error toast for a Save that just failed or conflicted, else `null`. */
export function failureToast(
  status: SaveFlowState["status"],
  noteName: string,
): SaveToast | null {
  if (status === "error") {
    return {
      kind: "error",
      message: `Could not save ${noteName}`,
      viewNote: false,
    };
  }
  if (status === "conflict") {
    return {
      kind: "error",
      message: `Could not save ${noteName}: it changed elsewhere`,
      viewNote: false,
    };
  }
  return null;
}
