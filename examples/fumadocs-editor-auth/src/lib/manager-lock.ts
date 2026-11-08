import type { SaveFlow } from "codemirror-obsidian-md/editor";

/**
 * The slice of a Save flow the deploy lock uses, for a page with no Note
 * editor: `applied` stands in for a Save (call it with the commit Apply
 * made), and `reload` reloads the page from GitHub. Lets the Manager reuse the
 * Note editor's lock, with its timings, instead of a second one.
 */
export function createManagerFlow(reloadPage: () => void): {
  flow: SaveFlow;
  applied: (commit?: string) => void;
} {
  const listeners = new Set<(result: { commit?: string }) => void>();
  const flow = {
    onSaved(listener: (result: { commit?: string }) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async reload() {
      reloadPage();
      return true;
    },
  } as unknown as SaveFlow;
  return {
    flow,
    applied(commit) {
      for (const listener of [...listeners]) listener({ commit });
    },
  };
}
