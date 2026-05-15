import { defineRouting } from "next-intl/routing";
import { createNavigation } from "next-intl/navigation";

/**
 * i18n routing for iSolveUrProblems (M1.6a).
 *
 * URL-based locale per Q1.6a1 (e.g. /es/auth/sign-in). Default locale
 * uses Accept-Language with EN fallback per Q1.6a2.
 *
 * M1.6a launch set: EN, ES, FR, PT, DE, ZH. Translation content lands
 * in M1.6b.
 */
export const locales = ["en", "es", "fr", "pt", "de", "zh"] as const;
export const defaultLocale = "en" as const;

export type Locale = (typeof locales)[number];

export const routing = defineRouting({
  locales,
  defaultLocale,
  // "as-needed" keeps URLs clean for English speakers (no /en prefix)
  // while every other locale is explicit (/es/..., /fr/...).
  localePrefix: "as-needed",
  // Detect locale from Accept-Language header for first-time visitors.
  localeDetection: true,
});

// Locale-aware wrappers around Next.js navigation primitives.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
