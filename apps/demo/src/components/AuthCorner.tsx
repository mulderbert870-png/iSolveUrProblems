"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "../i18n/routing";
import { useUser } from "../lib/auth/AuthProvider";
import { LocalePicker } from "./LocalePicker";

/**
 * Tiny auth + locale indicator pinned in the top-right corner.
 *
 * Anonymous → "Sign in" link.
 * Signed-in  → email + "Sign out" button.
 * Always: locale picker for switching language.
 *
 * Locale-aware Link from next-intl so /auth/sign-in becomes the
 * correctly-prefixed path (e.g. /es/auth/sign-in) for non-English users.
 */
export function AuthCorner() {
  const { user, loading, signOut } = useUser();
  const t = useTranslations("auth.corner");
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <div className="fixed top-3 right-3 z-50 flex items-center gap-2 text-xs text-zinc-500">
        <LocalePicker />
        <span>…</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="fixed top-3 right-3 z-50 flex items-center gap-2">
        <LocalePicker />
        <Link
          href="/auth/sign-in"
          className="rounded-md bg-zinc-800/80 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 backdrop-blur"
        >
          {t("signIn")}
        </Link>
      </div>
    );
  }

  const label = user.email ?? user.phone ?? user.id.slice(0, 8);

  return (
    <div className="fixed top-3 right-3 z-50 flex items-center gap-2 rounded-md bg-zinc-800/80 px-3 py-1.5 text-xs text-zinc-200 backdrop-blur">
      <LocalePicker />
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
        {busy ? "…" : t("signOut")}
      </button>
    </div>
  );
}
