"use client";

import { useCallback, useSyncExternalStore } from "react";

const OPEN = "1";
const CLOSED = "0";

/** Same-tab writes do not fire `storage`, so they announce themselves here. */
const LOCAL_EVENT = "persisted-open";

function read(key: string, defaultOpen: boolean): boolean {
  try {
    const stored = window.localStorage.getItem(key);
    if (stored === OPEN) return true;
    if (stored === CLOSED) return false;
  } catch {
    // localStorage can be blocked; fall through to the default.
  }
  return defaultOpen;
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(LOCAL_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(LOCAL_EVENT, onChange);
  };
}

/**
 * Open/closed state remembered in `localStorage` under `key` and kept in sync
 * between tabs (`storage` event) and between components using the same key.
 *
 * The server and the hydration pass render `defaultOpen`; the stored value
 * takes over right after. Pair it with `persistedOpenScript` so the DOM already
 * shows the stored state before hydration.
 *
 * @returns `[open, setOpen]`
 */
export function usePersistedOpen(
  key: string,
  defaultOpen: boolean,
): readonly [boolean, (open: boolean) => void] {
  const open = useSyncExternalStore(
    subscribe,
    () => read(key, defaultOpen),
    () => defaultOpen,
  );

  const setOpen = useCallback(
    (next: boolean) => {
      try {
        window.localStorage.setItem(key, next ? OPEN : CLOSED);
      } catch {
        // Not persisted; still notify so the UI reflects the choice.
      }
      window.dispatchEvent(new Event(LOCAL_EVENT));
    },
    [key],
  );

  return [open, setOpen];
}

/**
 * Inline script body for the no-flash guide: sets `data-open` on the element
 * with `id` from the stored value, synchronously during HTML parsing.
 */
export function persistedOpenScript(id: string, key: string): string {
  return `(function(){try{var v=localStorage.getItem(${JSON.stringify(key)});var e=document.getElementById(${JSON.stringify(id)});if(e&&(v==="1"||v==="0"))e.setAttribute("data-open",v==="1"?"true":"false")}catch(e){}})()`;
}
