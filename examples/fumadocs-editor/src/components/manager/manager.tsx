"use client";

import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  movedPath,
  planReorganization,
  renamedPath,
  type StagedChange,
} from "codemirror-obsidian-md/manager";
import { listFolders } from "codemirror-obsidian-md/new-note";
import { FileTextIcon, FolderIcon, GripVerticalIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  buildTree,
  commitMessage,
  TRAILER,
  type TreeNode,
} from "@/lib/manager";

type Editing = { path: string; mode: "move" | "rename" } | null;

function kindOf(change: StagedChange): "Move" | "Rename" {
  const folder = (p: string) => p.slice(0, Math.max(0, p.lastIndexOf("/")));
  return folder(change.from) === folder(change.to) ? "Rename" : "Move";
}

/** Ref callback: the input appears because the user asked for it, so focus it. */
function focusOnMount(element: HTMLInputElement | null) {
  element?.focus();
}

function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/**
 * Reorganize the Vault: drag Notes onto folders, or use "Move to…" and
 * "Rename". Nothing is written until Apply, which makes one commit.
 */
export function Manager(props: { files: string[]; base: string }) {
  const [files, setFiles] = useState(props.files);
  const [base, setBase] = useState(props.base);
  const [changes, setChanges] = useState<StagedChange[]>([]);
  const [editing, setEditing] = useState<Editing>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [applying, setApplying] = useState(false);

  const plan = useMemo(
    () => planReorganization({ files, changes }),
    [files, changes],
  );
  const shown = plan.ok ? plan.files : files;
  const tree = useMemo(() => buildTree(shown), [shown]);
  const folders = useMemo(() => listFolders(shown), [shown]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  /** Stage a move, or say why not. Returns whether it was staged. */
  function stage(from: string, to: string): boolean {
    const next = [...changes, { type: "move" as const, from, to }];
    const result = planReorganization({ files, changes: next });
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    setChanges(next);
    setError(null);
    return true;
  }

  function undo(index: number) {
    const next = changes.filter((_, i) => i !== index);
    if (!planReorganization({ files, changes: next }).ok) {
      setError("A later change depends on this one. Undo that first.");
      return;
    }
    setChanges(next);
    setError(null);
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const from = String(active.id).replace(/^file:/, "");
    const folder = String(over?.id ?? "").replace(/^folder:/, "");
    if (!over || String(over.id).startsWith("file:")) return;
    const to = movedPath(from, folder);
    if (to !== from) stage(from, to);
  }

  async function apply() {
    if (!plan.ok || applying) return;
    setApplying(true);
    try {
      const response = await fetch("/api/manage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ base, changeset: plan.changeset }),
      });
      const body = (await response.json()) as { base?: string; error?: string };
      if (response.ok && body.base) {
        setFiles(plan.files);
        setBase(body.base);
        setChanges([]);
        setConfirming(false);
        toast.success(`Committed: ${plan.subject}`);
      } else if (body.error === "stale-base") {
        setConfirming(false);
        toast.error(
          "The Vault changed since you opened this page. Your staged changes are kept; reload to see the current Vault.",
          {
            action: {
              label: "Reload",
              onClick: () => window.location.reload(),
            },
          },
        );
      } else {
        setConfirming(false);
        toast.error(
          body.error === "already-exists"
            ? "A file already exists at one of the new paths. Your staged changes are kept."
            : "Could not apply the changes. Your staged changes are kept.",
        );
      }
    } catch {
      toast.error("Could not reach the server. Your staged changes are kept.");
    } finally {
      setApplying(false);
    }
  }

  const empty = !plan.ok || plan.changeset.length === 0;

  return (
    <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
      <DndContext id="manager" onDragEnd={onDragEnd} sensors={sensors}>
        <section aria-label="Vault">
          <RootDrop />
          <TreeList
            editing={editing}
            folders={folders}
            nodes={tree}
            onEdit={(next) => {
              setEditing(next);
              setError(null);
            }}
            stage={stage}
          />
        </section>
      </DndContext>

      <section
        aria-label="Pending changes"
        className="grid content-start gap-3"
      >
        <h2 className="font-semibold text-lg">Pending changes</h2>
        {error && (
          <p
            className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-destructive text-sm"
            data-testid="error"
            role="alert"
          >
            {error}
          </p>
        )}
        {changes.length === 0 ? (
          <p className="text-muted-foreground text-sm">No pending changes</p>
        ) : (
          <ul className="grid gap-2" data-testid="pending">
            {changes.map((change, index) => {
              const kind = kindOf(change);
              return (
                <li
                  className="flex items-center justify-between gap-2 text-sm"
                  key={`${change.from}->${change.to}`}
                >
                  <span className="break-all">
                    {kind} {change.from} → {change.to}
                  </span>
                  <Button
                    aria-label={`Undo ${kind} ${change.from}`}
                    onClick={() => undo(index)}
                    size="xs"
                    variant="outline"
                  >
                    Undo
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex gap-2">
          <Button disabled={empty} onClick={() => setConfirming(true)}>
            Apply
          </Button>
          <Button
            disabled={changes.length === 0}
            onClick={() => {
              setChanges([]);
              setError(null);
            }}
            variant="outline"
          >
            Discard all
          </Button>
        </div>
      </section>

      {confirming && plan.ok && (
        <Dialog onOpenChange={(open) => !open && setConfirming(false)} open>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Commit changes</DialogTitle>
              <DialogDescription>
                This makes one commit. Old URLs of moved Notes will not
                redirect, so external links and bookmarks to them will break.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <label className="font-medium text-sm" htmlFor="subject">
                Commit subject
              </label>
              <input
                className="w-full rounded-md border bg-muted px-2 py-1.5 font-mono text-sm"
                data-testid="commit-subject"
                id="subject"
                readOnly
                value={plan.subject}
              />
              <label className="font-medium text-sm" htmlFor="body">
                Commit body
              </label>
              <textarea
                className="w-full rounded-md border bg-muted px-2 py-1.5 font-mono text-sm"
                data-testid="commit-body"
                id="body"
                readOnly
                rows={Math.min(8, plan.moves.length + 1)}
                value={commitMessage(plan).split("\n\n")[1]}
              />
              <label className="font-medium text-sm" htmlFor="trailer">
                Trailer (added automatically)
              </label>
              <textarea
                className="w-full rounded-md border bg-muted px-2 py-1.5 font-mono text-sm"
                data-testid="commit-trailer"
                id="trailer"
                readOnly
                rows={1}
                value={TRAILER}
              />
            </div>
            <DialogFooter>
              <Button onClick={() => setConfirming(false)} variant="outline">
                Cancel
              </Button>
              <Button disabled={applying} onClick={() => void apply()}>
                Commit
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function RootDrop() {
  const { setNodeRef, isOver } = useDroppable({ id: "folder:" });
  return (
    <div
      className={`mb-1 flex items-center gap-2 rounded-md px-2 py-1 font-medium text-sm ${isOver ? "bg-primary/15" : ""}`}
      data-folder=""
      ref={setNodeRef}
    >
      <FolderIcon className="size-4" />
      Vault root
    </div>
  );
}

function TreeList(props: {
  nodes: TreeNode[];
  folders: string[];
  editing: Editing;
  onEdit: (next: Editing) => void;
  stage: (from: string, to: string) => boolean;
}) {
  return (
    <ul className="grid gap-0.5 pl-4">
      {props.nodes.map((node) =>
        node.kind === "folder" ? (
          <FolderItem key={node.path} {...props} node={node} />
        ) : (
          <FileItem key={node.path} {...props} node={node} />
        ),
      )}
    </ul>
  );
}

function FolderItem(
  props: Parameters<typeof TreeList>[0] & {
    node: Extract<TreeNode, { kind: "folder" }>;
  },
) {
  const { node } = props;
  const { setNodeRef, isOver } = useDroppable({ id: `folder:${node.path}` });
  return (
    <li>
      <div
        className={`flex items-center gap-2 rounded-md px-2 py-1 font-medium text-sm ${isOver ? "bg-primary/15" : ""}`}
        data-folder={node.path}
        ref={setNodeRef}
      >
        <FolderIcon className="size-4" />
        {node.name}
      </div>
      <TreeList {...props} nodes={node.children} />
    </li>
  );
}

function FileItem(
  props: Parameters<typeof TreeList>[0] & {
    node: Extract<TreeNode, { kind: "file" }>;
  },
) {
  const { node, editing, folders, onEdit, stage } = props;
  const path = node.path;
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `file:${path}`,
  });
  const mode = editing?.path === path ? editing.mode : null;

  return (
    <li
      className={`rounded-md px-2 py-1 ${isDragging ? "opacity-50" : ""}`}
      data-path={path}
      ref={setNodeRef}
    >
      <div className="flex items-center gap-2 text-sm">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Drag ${path}`}
          className="cursor-grab touch-none rounded p-0.5 text-muted-foreground"
        >
          <GripVerticalIcon className="size-4" />
        </button>
        <FileTextIcon className="size-4" />
        <span className="flex-1 break-all">{node.name}</span>
        <Button
          aria-label={`Move to… ${path}`}
          onClick={() => onEdit({ path, mode: "move" })}
          size="xs"
          variant="outline"
        >
          Move to…
        </Button>
        <Button
          aria-label={`Rename ${path}`}
          onClick={() => onEdit({ path, mode: "rename" })}
          size="xs"
          variant="outline"
        >
          Rename
        </Button>
      </div>
      {mode === "move" && (
        <form
          className="mt-1 flex gap-2 pl-6"
          onSubmit={(event) => {
            event.preventDefault();
            const value = new FormData(event.currentTarget).get("folder");
            if (
              typeof value === "string" &&
              stage(path, movedPath(path, value))
            )
              onEdit(null);
          }}
        >
          <input
            aria-label={`Folder for ${path}`}
            className="w-full rounded-md border bg-background px-2 py-1 text-sm"
            list={`folders-${path}`}
            name="folder"
            onKeyDown={(event) => event.key === "Escape" && onEdit(null)}
            placeholder="Folder (empty for the Vault root)"
            ref={focusOnMount}
          />
          <datalist id={`folders-${path}`}>
            {folders.map((folder) => (
              <option key={folder} value={folder} />
            ))}
          </datalist>
          <Button size="xs" type="submit">
            Move
          </Button>
        </form>
      )}
      {mode === "rename" && (
        <form
          className="mt-1 flex gap-2 pl-6"
          onSubmit={(event) => {
            event.preventDefault();
            const value = new FormData(event.currentTarget).get("name");
            if (
              typeof value === "string" &&
              stage(path, renamedPath(path, value))
            )
              onEdit(null);
          }}
        >
          <input
            aria-label={`New name for ${path}`}
            className="w-full rounded-md border bg-background px-2 py-1 text-sm"
            defaultValue={fileName(path).replace(/\.md$/, "")}
            name="name"
            onKeyDown={(event) => event.key === "Escape" && onEdit(null)}
            ref={focusOnMount}
          />
          <Button size="xs" type="submit">
            Rename
          </Button>
        </form>
      )}
    </li>
  );
}
