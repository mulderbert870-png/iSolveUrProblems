"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "../i18n/routing";
import { useUser } from "../lib/auth/AuthProvider";
import { LocalePicker } from "./LocalePicker";

/**
 * Inline locale-picker + auth control. Designed to sit under the page
 * title (not in a fixed corner). Used on the home page beneath the
 * "iSolveUrProblems.ai – beta" header.
 *
 * Anonymous → "Sign in" link.
 * Signed-in  → email + "Sign out" button.
 */
export function HeaderControls() {
  const { user, loading, signOut } = useUser();
  const t = useTranslations("auth.corner");
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex items-center justify-center gap-2 mt-2 text-xs">
      <LocalePicker />
      {loading ? (
        <span className="text-zinc-500">…</span>
      ) : !user ? (
        <Link
          href="/auth/sign-in"
          className="rounded-md bg-zinc-800/80 px-3 py-1.5 text-zinc-200 hover:bg-zinc-700 backdrop-blur"
        >
          {t("signIn")}
        </Link>
      ) : (
        <div className="flex items-center gap-2 rounded-md bg-zinc-800/80 px-3 py-1.5 text-zinc-200 backdrop-blur">
          <span className="max-w-[160px] truncate">
            {user.email ?? user.phone ?? user.id.slice(0, 8)}
          </span>
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
      )}
    </div>
  );
}
