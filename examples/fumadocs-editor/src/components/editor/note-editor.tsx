"use client";

import type { NoteCandidate, SaveFlow } from "codemirror-obsidian-md/editor";
import { useEffect, useRef, useState } from "react";

/**
 * The live editor. The editor code is imported dynamically, so only the edit
 * route ever downloads it; readers' pages never import this component.
 */
export function NoteEditor(props: {
  path: string;
  candidates: NoteCandidate[];
}) {
  const { path } = props;
  // A ref, so a refreshed server render (new array identity) never remounts
  // the editor and silently reloads the file under the writer.
  const candidatesRef = useRef(props.candidates);
  candidatesRef.current = props.candidates;
  const parentRef = useRef<HTMLDivElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const [flow, setFlow] = useState<SaveFlow | null>(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let destroy: (() => void) | undefined;
    let cancelled = false;

    import("@/lib/editor-setup")
      .then(({ setupEditor }) =>
        setupEditor({
          parent: parentRef.current as HTMLDivElement,
          bannerParent: bannerRef.current as HTMLDivElement,
          path,
          candidates: candidatesRef.current,
        }),
      )
      .then((setup) => {
        if (cancelled) return setup.destroy();
        destroy = setup.destroy;
        setFlow(setup.flow);
        setStatus(setup.flow.state.status);
        setup.flow.subscribe((state) =>
          setStatus(state.dirty ? `${state.status}, unsaved` : state.status),
        );
      })
      .catch((e: unknown) => setError(String(e)));

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [path]);

  return (
    <div>
      <div className="mb-2 flex items-center gap-3">
        <button
          className="rounded-md border px-3 py-1 text-sm"
          disabled={!flow}
          onClick={() => void flow?.save()}
          type="button"
        >
          Save
        </button>
        <span className="text-fd-muted-foreground text-sm" data-testid="status">
          {error ?? status}
        </span>
      </div>
      <div ref={bannerRef} />
      <div className="rounded-md border p-2" ref={parentRef} />
    </div>
  );
}
