import type { SaveFlowState } from "codemirror-obsidian-md/editor";

/** What the toolbar shows; `error` and `conflict` keep their own banner. */
export function statusLabel(
  state: Pick<SaveFlowState, "status" | "dirty">,
): string {
  if (state.status === "saving") return "Saving…";
  if (state.status === "conflict") return "Conflict";
  if (state.status === "error") return "Save failed";
  return state.dirty ? "Unsaved changes" : "All changes saved";
}

/** The success toast's message. */
export function savedMessage(noteName: string): string {
  return `Saved ${noteName}`;
}

/** The error toast's message for a Save that just failed, else `null`. */
export function failureMessage(
  status: SaveFlowState["status"],
  noteName: string,
): string | null {
  if (status === "error") return `Could not save ${noteName}`;
  if (status === "conflict") {
    return `Could not save ${noteName}: it changed elsewhere`;
  }
  return null;
}
