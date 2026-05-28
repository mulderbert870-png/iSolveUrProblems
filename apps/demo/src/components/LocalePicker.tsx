"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, usePathname, locales, type Locale } from "../i18n/routing";
import { useUser } from "../lib/auth/AuthProvider";

/**
 * Locale switcher. Updates the URL (next-intl router pushes a localized
 * path) and — when a user is signed in — persists the choice to
 * users.preferred_locale via /api/user/preferences.
 */
export function LocalePicker() {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("locale");
  const { user } = useUser();
  const [isPending, startTransition] = useTransition();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as Locale;
    if (next === locale) return;
    startTransition(() => {
      router.replace(pathname, { locale: next });
      if (user) {
        // Fire-and-forget; UI doesn't need to wait for persistence.
        void fetch("/api/user/preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preferred_locale: next }),
        });
      }
    });
  }

  return (
    <label className="flex items-center gap-1 text-xs text-zinc-200">
      <span className="sr-only">{t("label")}</span>
      <select
        value={locale}
        onChange={onChange}
        disabled={isPending}
        className="rounded bg-zinc-800/80 px-2 py-1 text-xs text-zinc-100 outline-none backdrop-blur disabled:opacity-50"
        aria-label={t("label")}
      >
        {locales.map((l) => (
          <option key={l} value={l}>
            {t(`name.${l}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
