"use client";

import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  checkSegments,
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

/** The Notes' text once `plan` is committed: rewritten Notes and moved paths. */
function committedNotes(
  notes: Record<string, string>,
  plan: Extract<ReturnType<typeof planReorganization>, { ok: true }>,
): Record<string, string> {
  const next = { ...notes };
  for (const change of plan.changeset) {
    if (change.type === "rename") {
      const text = next[change.from];
      if (text !== undefined) {
        delete next[change.from];
        next[change.to] = text;
      }
    } else if (change.type === "write") next[change.path] = change.content;
  }
  return next;
}

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
 * Reorganize the Vault: drag Notes, Assets and folders onto folders, or use
 * "Move to…" and "Rename". A new folder exists only once something is moved
 * into it; an empty one is dropped on Apply. Nothing is written until Apply, which makes one commit.
 */
export function Manager(props: {
  files: string[];
  base: string;
  notes: Record<string, string>;
}) {
  const [files, setFiles] = useState(props.files);
  const [notes, setNotes] = useState(props.notes);
  const [base, setBase] = useState(props.base);
  const [changes, setChanges] = useState<StagedChange[]>([]);
  // Folders the user made up. They exist only once something is moved into them.
  const [newFolders, setNewFolders] = useState<string[]>([]);
  const [editing, setEditing] = useState<Editing>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [applying, setApplying] = useState(false);

  const plan = useMemo(
    () => planReorganization({ files, changes, notes }),
    [files, changes, notes],
  );
  const shown = plan.ok ? plan.files : files;
  const tree = useMemo(() => buildTree(shown, newFolders), [shown, newFolders]);
  const folders = useMemo(
    () => [...new Set([...listFolders(shown), ...newFolders])].sort(),
    [shown, newFolders],
  );
  const emptyFolders = newFolders.filter(
    (folder) => !shown.some((path) => path.startsWith(`${folder}/`)),
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  /** Stage a move, or say why not. Returns whether it was staged. */
  function stage(from: string, to: string): boolean {
    const next = [...changes, { type: "move" as const, from, to }];
    const result = planReorganization({ files, changes: next, notes });
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    setChanges(next);
    setError(null);
    return true;
  }

  /** Stage a new folder, or say why not. */
  function addFolder(value: string): boolean {
    const name = value.trim().replace(/\/+$/, "");
    const invalid = checkSegments(name, "path");
    if (invalid) {
      setError(invalid);
      return false;
    }
    const lower = name.toLowerCase();
    const taken = [...folders, ...shown].find(
      (path) => path.toLowerCase() === lower || path.startsWith(`${name}/`),
    );
    if (taken) {
      setError(`"${name}" already exists.`);
      return false;
    }
    setNewFolders([...newFolders, name]);
    setError(null);
    return true;
  }

  function undo(index: number) {
    const next = changes.filter((_, i) => i !== index);
    if (!planReorganization({ files, changes: next, notes }).ok) {
      setError("A later change depends on this one. Undo that first.");
      return;
    }
    setChanges(next);
    setError(null);
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const from = String(active.id).replace(/^(file|dir):/, "");
    const folder = String(over?.id ?? "").replace(/^folder:/, "");
    if (!over || !String(over.id).startsWith("folder:")) return;
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
        setNotes(committedNotes(notes, plan));
        setBase(body.base);
        setChanges([]);
        // A folder nothing was moved into never reaches the Vault.
        setNewFolders([]);
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
      <DndContext
        collisionDetection={pointerWithin}
        id="manager"
        onDragEnd={onDragEnd}
        sensors={sensors}
      >
        <section aria-label="Vault">
          <NewFolderForm onAdd={addFolder} />
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
        {emptyFolders.length > 0 && (
          <ul className="grid gap-1 text-sm" data-testid="new-folders">
            {emptyFolders.map((folder) => (
              <li
                className="flex items-center justify-between gap-2"
                key={folder}
              >
                <span className="break-all">
                  New folder {folder} (dropped unless something is moved into
                  it)
                </span>
                <Button
                  aria-label={`Remove new folder ${folder}`}
                  onClick={() =>
                    setNewFolders(newFolders.filter((f) => f !== folder))
                  }
                  size="xs"
                  variant="outline"
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
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
        {plan.ok && plan.rewrites.length > 0 && (
          <div>
            <h3 className="font-medium text-sm">Links rewritten</h3>
            <ul className="grid gap-1 text-sm" data-testid="rewrites">
              {plan.rewrites.map((rewrite) => (
                <li className="break-all" key={rewrite.path}>
                  {rewrite.path}: {rewrite.links}{" "}
                  {rewrite.links === 1 ? "link" : "links"}
                </li>
              ))}
            </ul>
          </div>
        )}
        {plan.ok && plan.urls.length > 0 && (
          <div>
            <h3 className="font-medium text-sm">URLs that change</h3>
            <ul className="grid gap-1 text-sm" data-testid="urls">
              {plan.urls.map((url) => (
                <li className="break-all" key={url.path}>
                  {url.from} → {url.to}
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground text-xs">
              Old URLs will not redirect.
            </p>
          </div>
        )}
        <div className="flex gap-2">
          <Button disabled={empty} onClick={() => setConfirming(true)}>
            Apply
          </Button>
          <Button
            disabled={changes.length === 0 && newFolders.length === 0}
            onClick={() => {
              setChanges([]);
              setNewFolders([]);
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
                This makes one commit
                {plan.rewrites.length > 0 &&
                  `, rewriting links in ${plan.rewrites.length} ${plan.rewrites.length === 1 ? "Note" : "Notes"}`}
                .{" "}
                {plan.urls.length > 0
                  ? `${plan.urls.length} URL(s) change. Old URLs will not redirect, so external links and bookmarks to them will break.`
                  : "Note URLs stay the same."}
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
                rows={Math.min(8, plan.body.split("\n").length)}
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

function NewFolderForm(props: { onAdd: (name: string) => boolean }) {
  return (
    <form
      className="mb-2 flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const value = new FormData(form).get("folder");
        if (typeof value === "string" && props.onAdd(value)) form.reset();
      }}
    >
      <input
        aria-label="New folder"
        className="w-full rounded-md border bg-background px-2 py-1 text-sm"
        name="folder"
        placeholder="New folder (a path, e.g. Docs/Guides)"
      />
      <Button size="xs" type="submit" variant="outline">
        Add folder
      </Button>
    </form>
  );
}

type RowProps = Parameters<typeof TreeList>[0];

function FolderItem(
  props: RowProps & { node: Extract<TreeNode, { kind: "folder" }> },
) {
  const { node } = props;
  const { setNodeRef: dropRef, isOver } = useDroppable({
    id: `folder:${node.path}`,
  });
  const drag = useDraggable({ id: `dir:${node.path}` });
  return (
    <li className={drag.isDragging ? "opacity-50" : ""}>
      <div
        className={`flex items-center gap-2 rounded-md px-2 py-1 font-medium text-sm ${isOver ? "bg-primary/15" : ""}`}
        data-folder={node.path}
        ref={(element) => {
          dropRef(element);
          drag.setNodeRef(element);
        }}
      >
        <DragHandle drag={drag} path={node.path} />
        <FolderIcon className="size-4" />
        <span className="flex-1 break-all">{node.name}</span>
        <EditButtons {...props} path={node.path} />
      </div>
      <EditForms {...props} path={node.path} />
      <TreeList {...props} nodes={node.children} />
    </li>
  );
}

function FileItem(
  props: RowProps & { node: Extract<TreeNode, { kind: "file" }> },
) {
  const { node } = props;
  const path = node.path;
  const drag = useDraggable({ id: `file:${path}` });

  return (
    <li
      className={`rounded-md px-2 py-1 ${drag.isDragging ? "opacity-50" : ""}`}
      data-path={path}
      ref={drag.setNodeRef}
    >
      <div className="flex items-center gap-2 text-sm">
        <DragHandle drag={drag} path={path} />
        <FileTextIcon className="size-4" />
        <span className="flex-1 break-all">{node.name}</span>
        <EditButtons {...props} path={path} />
      </div>
      <EditForms {...props} path={path} />
    </li>
  );
}

function DragHandle(props: {
  drag: ReturnType<typeof useDraggable>;
  path: string;
}) {
  const { attributes, listeners } = props.drag;
  return (
    <button
      type="button"
      {...attributes}
      {...listeners}
      aria-label={`Drag ${props.path}`}
      className="cursor-grab touch-none rounded p-0.5 text-muted-foreground"
    >
      <GripVerticalIcon className="size-4" />
    </button>
  );
}

function EditButtons(props: RowProps & { path: string }) {
  const { path, onEdit } = props;
  return (
    <>
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
    </>
  );
}

/** The "Move to…" and "Rename" forms of a file or folder, shown below its row. */
function EditForms(props: RowProps & { path: string }) {
  const { path, editing, folders, onEdit, stage } = props;
  const mode = editing?.path === path ? editing.mode : null;

  return (
    <>
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
    </>
  );
}
