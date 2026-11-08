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
  renamedPath,
} from "codemirror-obsidian-md/manager";
import { listFolders } from "codemirror-obsidian-md/new-note";
import {
  folderRows,
  type Meta,
  type OrderRow,
  orderChildren,
} from "fumadocs-obsidian-md/meta";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  FileTextIcon,
  FolderIcon,
  GripVerticalIcon,
  MinusIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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

import { ROOT_FOCUS } from "@/lib/file-tree-targets";
import {
  buildTree,
  commitMessage,
  describeChange,
  type ManagerChange,
  type ManagerPlan,
  planManager,
  TRAILER,
  type TreeNode,
} from "@/lib/manager";

/** The Notes' text once `plan` is committed: rewritten Notes and moved paths. */
function committedNotes(
  notes: Record<string, string>,
  plan: Extract<ManagerPlan, { ok: true }>,
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

/**
 * The form open below a row. `path` is the item's path, or for a Separator
 * `<folder>#<row>`; for "separator" and "title" it is the folder.
 */
type Editing = {
  path: string;
  mode: "move" | "rename" | "title" | "separator" | "rename-separator";
} | null;

function where(folder: string): string {
  return folder === "" ? "the Vault root" : folder;
}

function dirname(path: string): string {
  return path.slice(0, Math.max(0, path.lastIndexOf("/")));
}

/** The name an item has in a folder's order: a Note without `.md`, a folder as is. */
function orderName(path: string, isFolder: boolean): string {
  const name = fileName(path);
  return isFolder ? name : name.replace(/\.md$/i, "");
}

/** Ref callback: the input appears because the user asked for it, so focus it. */
function focusOnMount(element: HTMLInputElement | null) {
  element?.focus();
}

function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/**
 * Reorganize the Vault: drag Notes, Assets and folders onto folders or between
 * rows, or use "Move to…", "Rename" and the up and down buttons. Separators and
 * folder titles are edited here too. A new folder exists only once something
 * is moved into it; an empty one is dropped on Apply. Nothing is written until
 * Apply, which makes one commit.
 */
export function Manager(props: {
  files: string[];
  base: string;
  notes: Record<string, string>;
  /** The text of each folder's `meta.json`, keyed by folder (`""` is the root). */
  metas: Record<string, string>;
  /**
   * The item to select and scroll into view when the page opens: a Vault path,
   * or `ROOT_FOCUS` for the root of the File Tree. The File Tree menu sets it.
   */
  focus?: string;
}) {
  const [files, setFiles] = useState(props.files);
  const [notes, setNotes] = useState(props.notes);
  const [metas, setMetas] = useState(props.metas);
  const [base, setBase] = useState(props.base);
  const [changes, setChanges] = useState<ManagerChange[]>([]);
  // Folders the user made up. They exist only once something is moved into them.
  const [newFolders, setNewFolders] = useState<string[]>([]);
  const [editing, setEditing] = useState<Editing>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [applying, setApplying] = useState(false);
  const [dragging, setDragging] = useState(false);

  const plan = useMemo(
    () => planManager({ files, metas, changes, notes }),
    [files, metas, changes, notes],
  );
  // A staged set is always valid (see `stageAll`), so the fallback is only a guard.
  const view = useMemo(
    () => (plan.ok ? plan : planManager({ files, metas, changes: [], notes })),
    [plan, files, metas, notes],
  );
  const shown = view.ok ? view.files : files;
  const folderMetas: Record<string, Meta> = view.ok ? view.metas : {};
  const tree = useMemo(() => buildTree(shown, newFolders), [shown, newFolders]);
  const folders = useMemo(
    () => [...new Set([...listFolders(shown), ...newFolders])].sort(),
    [shown, newFolders],
  );
  const emptyFolders = newFolders.filter(
    (folder) => !shown.some((path) => path.startsWith(`${folder}/`)),
  );

  // The File Tree menu deep-links to an item (`/manage?focus=<path>`).
  useEffect(() => {
    if (props.focus === undefined) return;
    document
      .querySelector('[data-focused="true"]')
      ?.scrollIntoView({ block: "center" });
  }, [props.focus]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  /** The rows of a folder's order, as they stand now. */
  function rowsFor(folder: string): OrderRow[] {
    return folderRows(folderMetas[folder], orderChildren(shown, folder));
  }

  /** Stage changes together, or say why not. Returns whether they were staged. */
  function stageAll(list: ManagerChange[]): boolean {
    const next = [...changes, ...list];
    const result = planManager({ files, metas, changes: next, notes });
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    setChanges(next);
    setError(null);
    return true;
  }

  function stage(from: string, to: string): boolean {
    return stageAll([{ type: "move", from, to }]);
  }

  function reorder(folder: string, from: number, to: number) {
    if (from !== to) stageAll([{ type: "reorder", folder, from, to }]);
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
    if (!planManager({ files, metas, changes: next, notes }).ok) {
      setError("A later change depends on this one. Undo that first.");
      return;
    }
    setChanges(next);
    setError(null);
  }

  /** Drop an item between two rows: reorder, moving it into the folder first if it is elsewhere. */
  function dropOnSlot(activeId: string, folder: string, slot: number) {
    if (activeId.startsWith("sep:")) {
      const key = activeId.slice(4);
      const hash = key.lastIndexOf("#");
      if (key.slice(0, hash) !== folder) return;
      const from = Number(key.slice(hash + 1));
      reorder(folder, from, from < slot ? slot - 1 : slot);
      return;
    }
    const isFolder = activeId.startsWith("dir:");
    const path = activeId.replace(/^(file|dir):/, "");
    const name = orderName(path, isFolder);
    const orderable = isFolder
      ? shown.some((p) => p.startsWith(`${path}/`) && /\.md$/i.test(p))
      : /\.md$/i.test(path);
    const rowIndex = (rows: OrderRow[]) =>
      rows.findIndex(
        (r) => r.type === "item" && r.name === name && r.folder === isFolder,
      );

    if (dirname(path) === folder) {
      const from = rowIndex(rowsFor(folder));
      if (from >= 0) reorder(folder, from, from < slot ? slot - 1 : slot);
      return;
    }
    const move: ManagerChange = {
      type: "move",
      from: path,
      to: movedPath(path, folder),
    };
    if (!orderable) {
      stageAll([move]);
      return;
    }
    const moved = planManager({
      files,
      metas,
      changes: [...changes, move],
      notes,
    });
    if (!moved.ok) {
      setError(moved.error);
      return;
    }
    const rows = folderRows(
      moved.metas[folder],
      orderChildren(moved.files, folder),
    );
    const at = rowIndex(rows);
    stageAll(
      at >= 0 && at !== slot
        ? [move, { type: "reorder", folder, from: at, to: slot }]
        : [move],
    );
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setDragging(false);
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (overId.startsWith("slot:")) {
      const key = overId.slice(5);
      const hash = key.lastIndexOf("#");
      dropOnSlot(activeId, key.slice(0, hash), Number(key.slice(hash + 1)));
      return;
    }
    if (!overId.startsWith("folder:") || activeId.startsWith("sep:")) return;
    const from = activeId.replace(/^(file|dir):/, "");
    const to = movedPath(from, overId.replace(/^folder:/, ""));
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
        setMetas(plan.metaTexts);
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
  const treeProps: TreeProps = {
    editing,
    folders,
    metas: folderMetas,
    onEdit: (next) => {
      setEditing(next);
      setError(null);
    },
    reorder,
    rowsFor,
    stage,
    stageAll,
    dragging,
    focus: props.focus,
    setError,
  };

  return (
    <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
      <DndContext
        collisionDetection={pointerWithin}
        id="manager"
        onDragCancel={() => setDragging(false)}
        onDragEnd={onDragEnd}
        onDragStart={() => setDragging(true)}
        sensors={sensors}
      >
        <section aria-label="Vault">
          <NewFolderForm onAdd={addFolder} />
          <RootDrop {...treeProps} />
          <TreeList {...treeProps} folder="" nodes={tree} />
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
              const text = describeChange(change);
              return (
                <li
                  className="flex items-center justify-between gap-2 text-sm"
                  key={`${text}#${changes.slice(0, index).filter((c) => describeChange(c) === text).length}`}
                >
                  <span className="break-all">{text}</span>
                  <Button
                    aria-label={`Undo ${text}`}
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

interface TreeProps {
  folders: string[];
  editing: Editing;
  metas: Record<string, Meta>;
  onEdit: (next: Editing) => void;
  reorder: (folder: string, from: number, to: number) => void;
  rowsFor: (folder: string) => OrderRow[];
  stage: (from: string, to: string) => boolean;
  stageAll: (list: ManagerChange[]) => boolean;
  setError: (error: string | null) => void;
  dragging: boolean;
  focus?: string;
}

/** Ring on the item the page was opened on (see `Manager`'s `focus`). */
const FOCUS_RING = "ring-2 ring-primary";

function RootDrop(props: TreeProps) {
  const { setNodeRef, isOver } = useDroppable({ id: "folder:" });
  return (
    <div className="mb-1">
      <div
        className={`flex items-center gap-2 rounded-md px-2 py-1 font-medium text-sm ${isOver ? "bg-primary/15" : ""} ${props.focus === ROOT_FOCUS ? FOCUS_RING : ""}`}
        data-focused={props.focus === ROOT_FOCUS}
        data-folder=""
        ref={setNodeRef}
      >
        <FolderIcon className="size-4" />
        <span className="flex-1">Vault root</span>
        <Button
          aria-label={`Add Separator in ${where("")}`}
          onClick={() => props.onEdit({ path: "", mode: "separator" })}
          size="xs"
          variant="outline"
        >
          Add Separator
        </Button>
      </div>
      <EditForms {...props} path="" />
    </div>
  );
}

/** The gap before row `index` of `folder`: dropping an item here puts it there. */
function Slot(props: { folder: string; index: number; dragging: boolean }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `slot:${props.folder}#${props.index}`,
  });
  return (
    <li
      aria-hidden="true"
      className={`pointer-events-none relative z-10 h-2 list-none rounded-sm ${isOver ? "bg-primary" : props.dragging ? "bg-primary/10" : ""}`}
      data-slot={`${props.folder}#${props.index}`}
      ref={setNodeRef}
      style={{ margin: "-4px 0" }}
    />
  );
}

function TreeList(props: TreeProps & { folder: string; nodes: TreeNode[] }) {
  const { folder, nodes } = props;
  const rows = props.rowsFor(folder);
  const used = new Set<TreeNode>();
  const entries = rows.map((row, index) => {
    if (row.type === "separator") return { row, index, node: undefined };
    const node = nodes.find(
      (n) =>
        n.kind === (row.folder ? "folder" : "file") &&
        orderName(n.path, row.folder) === row.name,
    );
    if (node) used.add(node);
    return { row, index, node };
  });
  // Assets and folders without a Note take no part in the order.
  const unordered = nodes.filter((n) => !used.has(n));
  const count = rows.length;

  return (
    <ul className="m-0 grid list-none gap-0.5 pl-4 [&>li]:my-0">
      {entries.map(({ row, index, node }) => {
        const slot = (
          <Slot
            dragging={props.dragging}
            folder={folder}
            index={index}
            key={`slot:${index}`}
          />
        );
        if (row.type === "separator")
          return [
            slot,
            <SeparatorItem
              {...props}
              count={count}
              index={index}
              key={`sep:${index}:${row.title}`}
              title={row.title}
            />,
          ];
        if (!node) return null;
        const ordering = { index, count };
        return [
          slot,
          node.kind === "folder" ? (
            <FolderItem
              {...props}
              key={node.path}
              node={node}
              ordering={ordering}
            />
          ) : (
            <FileItem
              {...props}
              key={node.path}
              node={node}
              ordering={ordering}
            />
          ),
        ];
      })}
      {count > 0 && (
        <Slot dragging={props.dragging} folder={folder} index={count} />
      )}
      {unordered.map((node) =>
        node.kind === "folder" ? (
          <FolderItem {...props} key={node.path} node={node} />
        ) : (
          <FileItem {...props} key={node.path} node={node} />
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

/** Where a row sits among its siblings; absent for rows that take no part in the order. */
type Ordering = { index: number; count: number };

function FolderItem(
  props: TreeProps & {
    node: Extract<TreeNode, { kind: "folder" }>;
    ordering?: Ordering;
  },
) {
  const { node } = props;
  const { setNodeRef: dropRef, isOver } = useDroppable({
    id: `folder:${node.path}`,
  });
  const drag = useDraggable({ id: `dir:${node.path}` });
  const title = props.metas[node.path]?.title;
  return (
    <li className={drag.isDragging ? "opacity-50" : ""}>
      <div
        className={`flex items-center gap-2 rounded-md px-2 py-1 font-medium text-sm ${isOver ? "bg-primary/15" : ""} ${props.focus === node.path ? FOCUS_RING : ""}`}
        data-focused={props.focus === node.path}
        data-folder={node.path}
        ref={(element) => {
          dropRef(element);
          drag.setNodeRef(element);
        }}
      >
        <DragHandle drag={drag} label={node.path} />
        <FolderIcon className="size-4" />
        <span className="flex-1 break-all">
          {title ?? node.name}
          {title !== undefined && title !== node.name && (
            <span className="ml-2 font-normal text-muted-foreground text-xs">
              {node.name}
            </span>
          )}
        </span>
        <OrderButtons {...props} label={node.path} />
        <Button
          aria-label={`Edit title ${node.path}`}
          onClick={() => props.onEdit({ path: node.path, mode: "title" })}
          size="xs"
          variant="outline"
        >
          Title
        </Button>
        <Button
          aria-label={`Add Separator in ${node.path}`}
          onClick={() => props.onEdit({ path: node.path, mode: "separator" })}
          size="xs"
          variant="outline"
        >
          Add Separator
        </Button>
        <EditButtons {...props} path={node.path} />
      </div>
      <EditForms {...props} path={node.path} />
      <TreeList {...props} folder={node.path} nodes={node.children} />
    </li>
  );
}

function FileItem(
  props: TreeProps & {
    node: Extract<TreeNode, { kind: "file" }>;
    ordering?: Ordering;
  },
) {
  const { node } = props;
  const path = node.path;
  const drag = useDraggable({ id: `file:${path}` });

  return (
    <li
      className={`rounded-md px-2 py-1 ${drag.isDragging ? "opacity-50" : ""} ${props.focus === path ? FOCUS_RING : ""}`}
      data-focused={props.focus === path}
      data-path={path}
      ref={drag.setNodeRef}
    >
      <div className="flex items-center gap-2 text-sm">
        <DragHandle drag={drag} label={path} />
        <FileTextIcon className="size-4" />
        <span className="flex-1 break-all">{node.name}</span>
        <OrderButtons {...props} label={path} />
        <EditButtons {...props} path={path} />
      </div>
      <EditForms {...props} path={path} />
    </li>
  );
}

function SeparatorItem(
  props: TreeProps & {
    folder: string;
    index: number;
    count: number;
    title: string;
  },
) {
  const { folder, index, title } = props;
  const drag = useDraggable({ id: `sep:${folder}#${index}` });
  const key = `${folder}#${index}`;
  const editing =
    props.editing?.mode === "rename-separator" && props.editing.path === key;
  return (
    <li
      className={`rounded-md bg-muted/50 px-2 py-1 ${drag.isDragging ? "opacity-50" : ""}`}
      data-separator={key}
      ref={drag.setNodeRef}
    >
      <div className="flex items-center gap-2 text-sm">
        <DragHandle drag={drag} label={`Separator ${title}`} />
        <MinusIcon className="size-4" />
        <span className="flex-1 break-all font-semibold uppercase tracking-wide">
          {title}
        </span>
        <OrderButtons
          {...props}
          label={`Separator ${title}`}
          ordering={{ index, count: props.count }}
        />
        <Button
          aria-label={`Rename Separator ${title}`}
          onClick={() => props.onEdit({ path: key, mode: "rename-separator" })}
          size="xs"
          variant="outline"
        >
          Rename
        </Button>
        <Button
          aria-label={`Remove Separator ${title}`}
          onClick={() =>
            props.stageAll([{ type: "remove-separator", folder, index }])
          }
          size="xs"
          variant="outline"
        >
          Remove
        </Button>
      </div>
      {editing && (
        <form
          className="mt-1 flex gap-2 pl-6"
          onSubmit={(event) => {
            event.preventDefault();
            const value = new FormData(event.currentTarget).get("title");
            const next = typeof value === "string" ? value.trim() : "";
            if (next === "") return props.setError("Enter a title.");
            if (
              props.stageAll([
                { type: "rename-separator", folder, index, title: next },
              ])
            )
              props.onEdit(null);
          }}
        >
          <input
            aria-label={`New title for Separator ${title}`}
            className="w-full rounded-md border bg-background px-2 py-1 text-sm"
            defaultValue={title}
            name="title"
            onKeyDown={(event) => event.key === "Escape" && props.onEdit(null)}
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

function DragHandle(props: {
  drag: ReturnType<typeof useDraggable>;
  label: string;
}) {
  const { attributes, listeners } = props.drag;
  return (
    <button
      type="button"
      {...attributes}
      {...listeners}
      aria-label={`Drag ${props.label}`}
      className="cursor-grab touch-none rounded p-0.5 text-muted-foreground"
    >
      <GripVerticalIcon className="size-4" />
    </button>
  );
}

/** Move up and down among the siblings: the keyboard way to reorder. */
function OrderButtons(
  props: TreeProps & { label: string; ordering?: Ordering; folder?: string },
) {
  const { ordering } = props;
  if (!ordering) return null;
  const folder = props.folder ?? dirname(props.label);
  return (
    <>
      <Button
        aria-label={`Move up ${props.label}`}
        disabled={ordering.index === 0}
        onClick={() =>
          props.reorder(folder, ordering.index, ordering.index - 1)
        }
        size="icon-xs"
        variant="outline"
      >
        <ArrowUpIcon />
      </Button>
      <Button
        aria-label={`Move down ${props.label}`}
        disabled={ordering.index === ordering.count - 1}
        onClick={() =>
          props.reorder(folder, ordering.index, ordering.index + 1)
        }
        size="icon-xs"
        variant="outline"
      >
        <ArrowDownIcon />
      </Button>
    </>
  );
}

function EditButtons(props: TreeProps & { path: string }) {
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

/** The forms of a file or folder (Move to…, Rename, Title, Add Separator), shown below its row. */
function EditForms(props: TreeProps & { path: string }) {
  const { path, editing, folders, onEdit, stage, stageAll } = props;
  const mode = editing?.path === path ? editing.mode : null;

  return (
    <>
      {mode === "title" && (
        <form
          className="mt-1 flex gap-2 pl-6"
          onSubmit={(event) => {
            event.preventDefault();
            const value = new FormData(event.currentTarget).get("title");
            const next = typeof value === "string" ? value.trim() : "";
            if (
              stageAll([
                {
                  type: "set-title",
                  folder: path,
                  title: next === "" ? undefined : next,
                },
              ])
            )
              onEdit(null);
          }}
        >
          <input
            aria-label={`Title of ${path}`}
            className="w-full rounded-md border bg-background px-2 py-1 text-sm"
            defaultValue={props.metas[path]?.title ?? ""}
            name="title"
            onKeyDown={(event) => event.key === "Escape" && onEdit(null)}
            placeholder={`Title (empty for the folder name, ${fileName(path)})`}
            ref={focusOnMount}
          />
          <Button size="xs" type="submit">
            Set title
          </Button>
        </form>
      )}
      {mode === "separator" && (
        <form
          className="mt-1 flex gap-2 pl-6"
          onSubmit={(event) => {
            event.preventDefault();
            const value = new FormData(event.currentTarget).get("title");
            const next = typeof value === "string" ? value.trim() : "";
            if (next === "") return props.setError("Enter a title.");
            if (
              stageAll([
                {
                  type: "add-separator",
                  folder: path,
                  title: next,
                  index: props.rowsFor(path).length,
                },
              ])
            )
              onEdit(null);
          }}
        >
          <input
            aria-label={`Separator title in ${where(path)}`}
            className="w-full rounded-md border bg-background px-2 py-1 text-sm"
            name="title"
            onKeyDown={(event) => event.key === "Escape" && onEdit(null)}
            placeholder="Separator title (added last; drag it into place)"
            ref={focusOnMount}
          />
          <Button size="xs" type="submit">
            Add
          </Button>
        </form>
      )}
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
