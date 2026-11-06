import { listFolders, resolveNewNote } from "./validate.js";

export interface NewNoteScreenOptions {
  parent: HTMLElement;
  /** Vault-relative paths of every existing Note (folders are derived). */
  existingPaths: readonly string[];
  /** Called with the Vault-relative path once the input is valid. */
  onCreate: (path: string) => void;
  onCancel?: () => void;
  /** Initially selected folder. */
  folder?: string;
}

export interface NewNoteScreen {
  readonly element: HTMLElement;
  destroy(): void;
}

let uid = 0;

/**
 * Framework-agnostic new-Note form: a folder field with a picker of existing
 * folders (a typed nested folder is accepted), a name field, a live preview of
 * the resulting path and inline validation errors.
 */
export function createNewNoteScreen(
  options: NewNoteScreenOptions,
): NewNoteScreen {
  const id = `new-note-${++uid}`;
  const doc = options.parent.ownerDocument;
  const root = doc.createElement("div");
  root.className = "new-note";

  const form = doc.createElement("form");
  form.noValidate = true;

  const field = (label: string, el: HTMLElement) => {
    const wrap = doc.createElement("label");
    wrap.className = "new-note-field";
    wrap.append(doc.createTextNode(label), el);
    return wrap;
  };

  const folder = doc.createElement("input");
  folder.name = "folder";
  folder.setAttribute("list", `${id}-folders`);
  folder.placeholder = "Vault root";
  folder.autocomplete = "off";
  folder.value = options.folder ?? "";

  const datalist = doc.createElement("datalist");
  datalist.id = `${id}-folders`;
  for (const f of listFolders(options.existingPaths)) {
    const option = doc.createElement("option");
    option.value = f;
    datalist.append(option);
  }

  const name = doc.createElement("input");
  name.name = "name";
  name.placeholder = "Note name";
  name.autocomplete = "off";

  const preview = doc.createElement("p");
  preview.dataset.preview = "";
  const error = doc.createElement("p");
  error.setAttribute("role", "alert");
  error.id = `${id}-error`;
  error.hidden = true;

  const create = doc.createElement("button");
  create.type = "submit";
  create.textContent = "Create";
  const cancel = doc.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  cancel.dataset.cancel = "";

  form.append(
    field("Folder", folder),
    datalist,
    field("Name", name),
    preview,
    error,
    create,
    cancel,
  );
  root.append(form);
  options.parent.append(root);

  const evaluate = () =>
    resolveNewNote({
      folder: folder.value,
      name: name.value,
      existing: options.existingPaths,
    });

  const showError = (message: string | null) => {
    error.hidden = message === null;
    error.textContent = message ?? "";
    if (message === null) {
      name.removeAttribute("aria-invalid");
      name.removeAttribute("aria-describedby");
    } else {
      name.setAttribute("aria-invalid", "true");
      name.setAttribute("aria-describedby", error.id);
    }
  };

  const update = () => {
    const result = evaluate();
    preview.textContent = result.ok ? result.path : "";
    // Do not nag before anything is typed; submit reports an empty name.
    showError(result.ok || name.value === "" ? null : result.error);
  };
  const onSubmit = (event: Event) => {
    event.preventDefault();
    const result = evaluate();
    if (!result.ok) return showError(result.error);
    showError(null);
    options.onCreate(result.path);
  };
  const onCancel = () => options.onCancel?.();

  form.addEventListener("input", update);
  form.addEventListener("submit", onSubmit);
  cancel.addEventListener("click", onCancel);
  update();

  return {
    element: root,
    destroy() {
      form.removeEventListener("input", update);
      form.removeEventListener("submit", onSubmit);
      cancel.removeEventListener("click", onCancel);
      root.remove();
    },
  };
}
