"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { actionClass } from "./action-class";

/** Copies the Note's source, fetched from its raw `.md` export. */
export function CopyMarkdown({ href }: { href: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const response = await fetch(href);
    if (!response.ok) return;
    await navigator.clipboard.writeText(await response.text());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button className={actionClass} onClick={copy} type="button">
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      {copied ? "Copied" : "Copy Markdown"}
    </button>
  );
}
