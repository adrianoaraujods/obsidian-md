"use client";

import { type ReactNode, useId, useSyncExternalStore } from "react";

import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "./collapsible.js";
import { persistedOpenScript, usePersistedOpen } from "./use-persisted-open.js";

const noop = () => () => {};

/**
 * True for the server render and the hydration pass, false for a render made
 * only on the client (a client-side navigation). React rejects a `<script>`
 * rendered there, and the script has nothing left to do: the panel's state is
 * already read from storage by then.
 */
function useServerOrHydrating(): boolean {
  return useSyncExternalStore(
    noop,
    () => false,
    () => true,
  );
}

/**
 * Collapsible shell around the Properties rows. Remembers its state in
 * `localStorage` under `storageKey`; each surface (page, preview) uses its own.
 *
 * The root carries `data-open`, which the inline no-flash script sets before
 * React has hydrated. The panel stays mounted when closed, so style the closed
 * state from `[data-properties-panel][data-open="false"]` (for example
 * `display: none` on `[data-properties-content]`).
 */
export function PropertiesPanel({
  children,
  storageKey,
  defaultOpen,
  noFlash = true,
  label = "Properties",
  expandIcon,
}: {
  children: ReactNode;
  storageKey: string;
  defaultOpen: boolean;
  /** Skip the inline script where the panel is only rendered on the client. */
  noFlash?: boolean;
  /** The trigger's text. */
  label?: ReactNode;
  /** Icon slot for the expand/collapse control; there is no default. */
  expandIcon?: ReactNode;
}) {
  const id = useId();
  const [open, setOpen] = usePersistedOpen(storageKey, defaultOpen);
  const serverOrHydrating = useServerOrHydrating();

  return (
    <>
      <div
        data-open={open}
        data-properties-panel=""
        id={id}
        suppressHydrationWarning
      >
        <Collapsible onOpenChange={setOpen} open={open}>
          <CollapsibleTrigger data-properties-trigger="">
            {expandIcon ? (
              <span aria-hidden data-properties-expand-icon="">
                {expandIcon}
              </span>
            ) : null}
            {label}
          </CollapsibleTrigger>
          <CollapsiblePanel data-properties-content="" keepMounted>
            {children}
          </CollapsiblePanel>
        </Collapsible>
      </div>
      {noFlash && serverOrHydrating ? (
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: no-flash script, content is built from constants
          dangerouslySetInnerHTML={{
            __html: persistedOpenScript(id, storageKey),
          }}
        />
      ) : null}
    </>
  );
}
