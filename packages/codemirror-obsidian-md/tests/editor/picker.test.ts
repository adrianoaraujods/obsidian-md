// @vitest-environment jsdom
import { completionStatus, currentCompletions } from "@codemirror/autocomplete";
import { afterEach, describe, expect, it } from "vitest";

import {
  createEditor,
  type EditorHandle,
  type NoteCandidate,
  pickerExtension,
  rankCandidates,
  wikiLinkTarget,
} from "../../src/editor/index.js";

const candidates: NoteCandidate[] = [
  { path: "Projects/Roadmap.md" },
  { path: "Road trip.md" },
  { path: "Archive/Broadway.md" },
  { path: "Daily/2024-01-01.md", aliases: ["New Year"] },
  { path: "Notes/Readme.md" },
  { path: "Archive/Readme.md" },
];

describe("rankCandidates", () => {
  const titles = (q: string) =>
    rankCandidates(candidates, q).map((c) => c.path);

  it("returns every candidate for an empty query, alphabetically", () => {
    expect(titles("")).toEqual([
      "Archive/Broadway.md",
      "Archive/Readme.md",
      "Daily/2024-01-01.md",
      "Notes/Readme.md",
      "Projects/Roadmap.md",
      "Road trip.md",
    ]);
  });

  it("ranks prefix matches before substring matches", () => {
    expect(titles("road")).toEqual([
      "Projects/Roadmap.md",
      "Road trip.md",
      "Archive/Broadway.md",
    ]);
  });

  it("prefers an exact title over a longer prefix match", () => {
    const list = [{ path: "Roadmap.md" }, { path: "Road.md" }];
    expect(rankCandidates(list, "road")[0]?.path).toBe("Road.md");
  });

  it("is case-insensitive and matches aliases", () => {
    expect(titles("new year")).toEqual(["Daily/2024-01-01.md"]);
  });

  it("falls back to subsequence matching and drops non-matches", () => {
    expect(titles("rdmp")).toEqual(["Projects/Roadmap.md"]);
    expect(titles("zzz")).toEqual([]);
  });
});

describe("wikiLinkTarget", () => {
  it("uses the bare name when it is unambiguous", () => {
    expect(wikiLinkTarget(candidates[0] as NoteCandidate, candidates)).toBe(
      "Roadmap",
    );
  });

  it("uses the path when another Note shares the name", () => {
    expect(wikiLinkTarget(candidates[4] as NoteCandidate, candidates)).toBe(
      "Notes/Readme",
    );
  });

  it("asks the injected resolver which target reaches the Note", () => {
    const resolver = {
      resolve: (target: string) => ({
        kind: "note" as const,
        exists: true as const,
        path: "Projects/Roadmap.md",
        note: { title: target, aliases: [], cssclasses: [] },
      }),
    };
    // The resolver resolves the bare name to this Note: use it.
    expect(
      wikiLinkTarget(candidates[0] as NoteCandidate, candidates, resolver),
    ).toBe("Roadmap");
    // It resolves the bare name elsewhere: fall back to the path.
    expect(
      wikiLinkTarget(candidates[4] as NoteCandidate, candidates, resolver),
    ).toBe("Notes/Readme");
  });
});

const handles: EditorHandle[] = [];
function mount(doc: string, options: Parameters<typeof pickerExtension>[0]) {
  const parent = document.createElement("div");
  document.body.append(parent);
  const handle = createEditor({
    parent,
    doc,
    extensions: [pickerExtension(options)],
  });
  handles.push(handle);
  return handle;
}
afterEach(() => {
  for (const h of handles.splice(0)) h.destroy();
});

function choose(editor: EditorHandle, from: number, to: number) {
  const completion = currentCompletions(editor.view.state)[0];
  if (!completion || typeof completion.apply !== "function") {
    throw new Error("no completion to apply");
  }
  completion.apply(editor.view, completion, from, to);
}

const tick = () => new Promise((r) => setTimeout(r, 80));

function type(editor: EditorHandle, text: string) {
  const { from } = editor.view.state.selection.main;
  editor.view.dispatch({
    changes: { from, insert: text },
    selection: { anchor: from + text.length },
    userEvent: "input.type",
  });
}

describe("picker in the editor", () => {
  it("opens when [[ is typed and lists ranked candidates", async () => {
    const editor = mount("", { candidates });
    type(editor, "[[");
    await tick();
    expect(completionStatus(editor.view.state)).toBe("active");
    expect(currentCompletions(editor.view.state).length).toBe(6);
  });

  it("narrows by the typed text", async () => {
    const editor = mount("", { candidates });
    type(editor, "[[");
    type(editor, "road");
    await tick();
    expect(currentCompletions(editor.view.state).map((c) => c.label)).toEqual([
      "Roadmap",
      "Road trip",
      "Broadway",
    ]);
  });

  it("does not open without [[", async () => {
    const editor = mount("", { candidates });
    type(editor, "road");
    await tick();
    expect(completionStatus(editor.view.state)).toBeNull();
  });

  it("picking a candidate inserts a closed Wiki Link", async () => {
    const editor = mount("", { candidates });
    type(editor, "[[");
    type(editor, "roadm");
    await tick();
    const completion = currentCompletions(editor.view.state)[0];
    expect(completion?.label).toBe("Roadmap");
    choose(editor, 2, 7);
    expect(editor.getText()).toBe("[[Roadmap]]");
    expect(editor.view.state.selection.main.head).toBe(11);
  });

  it("inserts a path target for duplicates and an alias display", async () => {
    const editor = mount("", { candidates });
    type(editor, "[[");
    type(editor, "new year");
    await tick();
    choose(editor, 2, 10);
    expect(editor.getText()).toBe("[[2024-01-01|New Year]]");
  });

  it("does not duplicate closing brackets that already follow", async () => {
    const editor = mount("[[]]", { candidates });
    editor.view.dispatch({ selection: { anchor: 2 } });
    type(editor, "road");
    await tick();
    choose(editor, 2, 6);
    expect(editor.getText()).toBe("[[Roadmap]]");
    expect(editor.view.state.selection.main.head).toBe(11);
  });

  it("reads candidates lazily so props can change", async () => {
    let list: readonly NoteCandidate[] = [];
    const editor = mount("", { candidates: () => list });
    list = [{ path: "Late.md" }];
    type(editor, "[[");
    await tick();
    expect(currentCompletions(editor.view.state).map((c) => c.label)).toEqual([
      "Late",
    ]);
  });
});
