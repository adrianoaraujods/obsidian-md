"use client";

import type { NoteCandidate, SaveFlow } from "codemirror-obsidian-md/editor";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/** What the toolbar shows; `error` and `conflict` keep their own banner. */
function statusLabel(state: SaveFlow["state"]) {
  if (state.status === "saving") return "Saving…";
  if (state.status === "conflict") return "Conflict";
  if (state.status === "error") return "Save failed";
  return state.dirty ? "Unsaved changes" : "All changes saved";
}

/**
 * The live editor. The editor code is imported dynamically, so only the edit
 * route ever downloads it; readers' pages never import this component.
 */
export function NoteEditor(props: {
  path: string;
  candidates: NoteCandidate[];
  /** The Note's page, for the "View note" action. */
  viewHref: string;
}) {
  const { path, viewHref } = props;
  const noteName = path.replace(/^.*\//, "").replace(/\.md$/, "");
  // A ref, so a refreshed server render (new array identity) never remounts
  // the editor and silently reloads the file under the writer.
  const candidatesRef = useRef(props.candidates);
  candidatesRef.current = props.candidates;
  const parentRef = useRef<HTMLDivElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const [flow, setFlow] = useState<SaveFlow | null>(null);
  const [state, setState] = useState<SaveFlow["state"] | null>(null);
  const router = useRouter();
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
        setState(setup.flow.state);
        let previous = setup.flow.state.status;
        const offState = setup.flow.subscribe((next) => {
          setState(next);
          if (next.status !== previous && next.status === "error") {
            toast.error(`Could not save ${noteName}`);
          }
          if (next.status !== previous && next.status === "conflict") {
            toast.error(`Could not save ${noteName}: it changed elsewhere`);
          }
          previous = next.status;
        });
        const offSaved = setup.flow.onSaved(() =>
          toast.success(`Saved ${noteName}`, {
            action: {
              label: "View note",
              onClick: () => router.push(viewHref),
            },
          }),
        );
        const innerDestroy = setup.destroy;
        destroy = () => {
          offState();
          offSaved();
          innerDestroy();
        };
      })
      .catch((e: unknown) => setError(String(e)));

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [path, noteName, viewHref, router]);

  // Ctrl/Cmd+S saves from anywhere on the page. The editor binds it too and
  // marks the event handled, so a save started there is not repeated here.
  useEffect(() => {
    if (!flow) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== "s"
      ) {
        return;
      }
      event.preventDefault();
      void flow.save();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [flow]);

  return (
    <div>
      <div className="mb-2 flex items-center gap-3">
        <Button
          disabled={!flow || !state?.dirty || state.status === "saving"}
          onClick={() => void flow?.save()}
          size="sm"
          type="button"
        >
          Save
        </Button>
        <span
          className="flex items-center gap-1.5 text-muted-foreground text-sm"
          data-testid="status"
        >
          {state?.status === "saving" && <Spinner />}
          {error ?? (state ? statusLabel(state) : "Loading…")}
        </span>
      </div>
      <div ref={bannerRef} />
      <div className="rounded-md border p-2" ref={parentRef} />
    </div>
  );
}
