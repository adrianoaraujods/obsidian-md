"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ObsidianProvider } from "react-obsidian-md";

import { Properties } from "@/components/typography/properties";

/**
 * Gives every Hover Preview, however deeply nested, this Wiki's Next.js link
 * and its Properties Panel with lucide icons. The Preview Payload URL stays
 * the package default (`/api/preview/`).
 */
export function WikiProvider({ children }: { children: ReactNode }) {
  return (
    <ObsidianProvider
      linkComponent={Link}
      previewBodyClassName="markdown-rendered prose"
      renderProperties={(props) => <Properties {...props} />}
    >
      {children}
    </ObsidianProvider>
  );
}
