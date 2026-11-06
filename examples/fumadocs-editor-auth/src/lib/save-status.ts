import type { SaveFlowState } from "codemirror-obsidian-md/editor";

type LockStatus = "unlocked" | "locked" | "timeout";

/** What a toast shows; `action` is the "View note" link. */
export type SaveToast = {
  kind: "loading" | "success" | "error";
  message: string;
  action: boolean;
};

/**
 * The toolbar's status text. `savedHere` is whether this editor session has
 * made a Save, which is what tells "Saved" from a Note that was never edited.
 */
export function statusLabel(
  state: Pick<SaveFlowState, "status" | "dirty">,
  lock: LockStatus,
  savedHere: boolean,
): string {
  if (state.status === "saving") return "Saving…";
  if (state.status === "conflict") return "Conflict";
  if (state.status === "error") return "Save failed";
  if (state.dirty) return "Unsaved changes";
  if (lock === "locked") return "Saved, deploying";
  return savedHere ? "Saved" : "All changes saved";
}

export const WAITING_MESSAGE = "Committed. Waiting for the deploy…";

/**
 * The toast change for a deploy-lock transition, or `null` for none. The
 * "View note" action only comes with "Deployed": a timeout, or a reload out of
 * one, never sends the person to a page that may be stale.
 */
export function deployToast(
  from: LockStatus,
  to: LockStatus,
  noteName: string,
): SaveToast | null {
  if (to === "locked" && from !== "locked") {
    return { kind: "loading", message: WAITING_MESSAGE, action: false };
  }
  if (from === "locked" && to === "unlocked") {
    return { kind: "success", message: "Deployed", action: true };
  }
  if (from === "locked" && to === "timeout") {
    return {
      kind: "error",
      message: `${noteName} is saved but not live yet`,
      action: false,
    };
  }
  return null;
}

/** The toast for a Save the host cannot track to a deploy. */
export function savedToast(noteName: string): SaveToast {
  return { kind: "success", message: `Saved ${noteName}`, action: false };
}
