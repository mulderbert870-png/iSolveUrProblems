"use client";

import Link from "next/link";
import { useState } from "react";
import { useUser } from "../lib/auth/AuthProvider";

/**
 * Tiny auth indicator pinned in the top-right corner.
 *
 * Anonymous → "Sign in" link.
 * Signed-in  → email + "Sign out" button.
 *
 * Kept intentionally minimal in M1.1; a real account menu lands in a
 * later M1 step alongside the "What 6 remembers" panel.
 */
export function AuthCorner() {
  const { user, loading, signOut } = useUser();
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <div className="fixed top-3 right-3 z-50 text-xs text-zinc-500">…</div>
    );
  }

  if (!user) {
    return (
      <div className="fixed top-3 right-3 z-50">
        <Link
          href="/auth/sign-in"
          className="rounded-md bg-zinc-800/80 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 backdrop-blur"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const label = user.email ?? user.phone ?? user.id.slice(0, 8);

  return (
    <div className="fixed top-3 right-3 z-50 flex items-center gap-2 rounded-md bg-zinc-800/80 px-3 py-1.5 text-xs text-zinc-200 backdrop-blur">
      <span className="max-w-[160px] truncate">{label}</span>
      <button
        type="button"
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          try {
            await signOut();
          } finally {
            setBusy(false);
          }
        }}
        disabled={busy}
        className="text-zinc-400 hover:text-white disabled:opacity-50"
      >
        {busy ? "…" : "Sign out"}
      </button>
    </div>
  );
}
