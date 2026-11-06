"use client";

import { LogOut } from "lucide-react";

import { authClient } from "@/lib/auth/client";

/**
 * Sidebar footer: avatar, `@login` and Sign out. Renders nothing for a
 * signed-out visitor, who reaches sign-in only through Edit. It reads the
 * session in the browser so the Wiki's pages stay static.
 */
export function Account() {
  const { data } = authClient.useSession();
  if (!data) return null;

  const user = data.user as typeof data.user & { login?: string };

  return (
    <div
      className="flex w-full items-center gap-2 text-sm"
      data-testid="account"
    >
      {user.image && (
        <img
          alt=""
          className="size-6 rounded-full"
          height={24}
          src={user.image}
          width={24}
        />
      )}
      <span className="min-w-0 flex-1 truncate">
        @{user.login ?? user.name}
      </span>
      <button
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-fd-accent"
        onClick={() => authClient.signOut().then(() => location.reload())}
        type="button"
      >
        <LogOut className="size-4" />
        Sign out
      </button>
    </div>
  );
}
