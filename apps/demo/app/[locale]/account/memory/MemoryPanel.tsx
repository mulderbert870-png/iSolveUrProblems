"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "../../../../src/i18n/routing";
import { useUser } from "../../../../src/lib/auth/AuthProvider";
import type { MemoryFactKind } from "../../../../src/lib/memory/types";

type Fact = {
  id: string;
  kind: MemoryFactKind;
  content: string;
  created_at: string;
};

export default function MemoryPanel() {
  const { user, loading: authLoading } = useUser();
  const t = useTranslations("account.memory");
  const [facts, setFacts] = useState<Fact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/account/memory");
      if (!res.ok) {
        setError(t("loadError"));
        setFacts([]);
        return;
      }
      const data = (await res.json()) as { facts: Fact[] };
      setFacts(data.facts ?? []);
    } catch {
      setError(t("loadError"));
      setFacts([]);
    }
  }, [t]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    void refresh();
  }, [authLoading, user, refresh]);

  const forgetOne = useCallback(
    async (id: string) => {
      if (busyId) return;
      setBusyId(id);
      try {
        const res = await fetch(
          `/api/account/memory?id=${encodeURIComponent(id)}`,
          { method: "DELETE" },
        );
        if (res.ok) {
          setFacts((prev) => (prev ? prev.filter((f) => f.id !== id) : prev));
        }
      } finally {
        setBusyId(null);
      }
    },
    [busyId],
  );

  const forgetAll = useCallback(async () => {
    if (purging) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(t("forgetAllConfirm"))
    ) {
      return;
    }
    setPurging(true);
    try {
      const res = await fetch("/api/account/memory", { method: "DELETE" });
      if (res.ok) setFacts([]);
    } finally {
      setPurging(false);
    }
  }, [purging, t]);

  if (authLoading) {
    return <p className="text-sm text-zinc-400">…</p>;
  }
  if (!user) {
    return (
      <div className="flex flex-col gap-3 text-sm text-zinc-300">
        <p>{t("signInRequired")}</p>
        <Link
          href="/auth/sign-in?next=/account/memory"
          className="rounded-md bg-amber-400 text-zinc-900 px-3 py-2 font-medium w-fit"
        >
          {t("signInCta")}
        </Link>
      </div>
    );
  }

  if (facts === null) {
    return <p className="text-sm text-zinc-400">{t("loading")}</p>;
  }
  if (error) {
    return <p className="text-sm text-rose-400">{error}</p>;
  }
  if (facts.length === 0) {
    return <p className="text-sm text-zinc-400">{t("empty")}</p>;
  }

  // Group by kind for readability.
  const grouped = facts.reduce<Record<string, Fact[]>>((acc, f) => {
    (acc[f.kind] ??= []).push(f);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">
          {t("countLabel", { count: facts.length })}
        </p>
        <button
          type="button"
          onClick={forgetAll}
          disabled={purging}
          className="text-xs text-rose-300 hover:text-rose-200 underline disabled:opacity-50"
        >
          {purging ? t("forgettingAll") : t("forgetAll")}
        </button>
      </div>

      {Object.entries(grouped).map(([kind, list]) => (
        <section key={kind} className="flex flex-col gap-2">
          <h3 className="text-xs uppercase tracking-wide text-zinc-500">
            {t(`kind.${kind}` as const)}
          </h3>
          <ul className="flex flex-col gap-1.5">
            {list.map((f) => (
              <li
                key={f.id}
                className="group flex items-start justify-between gap-3 rounded-md bg-zinc-800/50 px-3 py-2 text-sm text-zinc-200"
              >
                <span className="flex-1">{f.content}</span>
                <button
                  type="button"
                  onClick={() => void forgetOne(f.id)}
                  disabled={busyId === f.id}
                  className="shrink-0 text-xs text-zinc-500 hover:text-rose-300 opacity-0 group-hover:opacity-100 disabled:opacity-50"
                  aria-label={t("forget")}
                >
                  {busyId === f.id ? "…" : t("forget")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
