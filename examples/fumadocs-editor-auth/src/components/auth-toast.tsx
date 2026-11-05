"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { authErrorMessage } from "@/lib/auth/messages";

/**
 * Tells a visitor why sign-in sent them back to the read-only page (cancelled,
 * denied, or rejected by the access hook). Reads `?error=` once, then removes
 * it from the address bar.
 */
export function AuthToast() {
  const code = useSearchParams().get("error");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const next = authErrorMessage(code);
    if (!next) return;
    setMessage(next);
    const url = new URL(location.href);
    url.searchParams.delete("error");
    history.replaceState(null, "", url);
    const timer = setTimeout(() => setMessage(null), 8000);
    return () => clearTimeout(timer);
  }, [code]);

  if (!message) return null;

  return (
    <div
      className="fixed right-4 bottom-4 z-50 flex max-w-sm items-start gap-3 rounded-lg border bg-fd-popover px-4 py-3 text-fd-popover-foreground text-sm shadow-lg"
      data-testid="toast"
      role="status"
    >
      <span>{message}</span>
      <button
        aria-label="Dismiss"
        className="text-fd-muted-foreground hover:text-fd-foreground"
        onClick={() => setMessage(null)}
        type="button"
      >
        ×
      </button>
    </div>
  );
}
