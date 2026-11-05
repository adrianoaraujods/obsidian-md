/** What a menu item can do with the Note that was right-clicked. */
export type NoteMenuContext = {
  /** The Note's path relative to the Vault, e.g. `Folder/Note.md`. */
  path: string;
  /** The Note's page URL, e.g. `/folder/note`. */
  url: string;
  /** Closes the menu. Called for you before `run`. */
  close: () => void;
  /** Opens the Delete confirmation for this Note. */
  requestDelete: () => void;
};

export type NoteMenuItem = {
  id: string;
  label: string;
  run: (context: NoteMenuContext) => void;
};

/**
 * The file tree's context menu, in display order. To add an item (for example
 * "New note here"), append an entry; the menu renders whatever is listed.
 */
export const NOTE_MENU_ITEMS: NoteMenuItem[] = [
  {
    id: "edit",
    label: "Edit",
    run: ({ url }) => {
      location.assign(`/edit${url === "/" ? "" : url}`);
    },
  },
  {
    id: "delete",
    label: "Delete",
    run: ({ requestDelete }) => requestDelete(),
  },
];
