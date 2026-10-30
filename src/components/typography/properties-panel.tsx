"use client";

import { ChevronRight } from "lucide-react";
import { type ReactNode, useId } from "react";

import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  persistedOpenScript,
  usePersistedOpen,
} from "@/hooks/use-persisted-open";

/**
 * Collapsible shell around the Properties rows. Remembers its state in
 * `localStorage` under `storageKey`; each surface (page, preview) uses its own.
 *
 * `keepMounted` plus the `data-open` rules below let the inline script show or
 * hide the panel before React has hydrated.
 */
export function PropertiesPanel({
  children,
  storageKey,
  defaultOpen,
  noFlash = true,
}: {
  children: ReactNode;
  storageKey: string;
  defaultOpen: boolean;
  /** Skip the inline script where the panel is only rendered on the client. */
  noFlash?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = usePersistedOpen(storageKey, defaultOpen);

  return (
    <>
      <div
        className="group/properties mb-8"
        data-open={open}
        id={id}
        suppressHydrationWarning
      >
        <Collapsible onOpenChange={setOpen} open={open}>
          <CollapsibleTrigger className="flex items-center gap-1 rounded-[6px] py-1 pr-2 text-muted-foreground text-sm hover:text-foreground">
            <ChevronRight
              aria-hidden
              className="size-4 transition-transform group-data-[open=true]/properties:rotate-90"
            />
            Properties
          </CollapsibleTrigger>
          <CollapsiblePanel
            className="group-data-[open=true]/properties:block group-data-[open=false]/properties:hidden"
            keepMounted
          >
            {children}
          </CollapsiblePanel>
        </Collapsible>
      </div>
      {noFlash ? (
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
