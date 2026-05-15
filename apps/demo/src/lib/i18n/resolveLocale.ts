import { defaultLocale, locales, type Locale } from "../../i18n/routing";
import { getSupabaseAdminConfig } from "../supabaseAdmin";

const LOCALE_SET = new Set<string>(locales);

/**
 * Server-side locale resolution. Priority:
 *   1. Signed-in user's `users.preferred_locale` (M1.1 column)
 *   2. Accept-Language header (first supported tag wins)
 *   3. defaultLocale
 *
 * Used by routes that need to act on behalf of the user in their
 * language — e.g. start-session passes this through to HeyGen via the
 * avatar-locale bridge.
 */
export async function resolveLocaleForRequest(args: {
  userId: string | null;
  acceptLanguage: string | null;
}): Promise<Locale> {
  if (args.userId) {
    const fromProfile = await fetchProfileLocale(args.userId);
    if (fromProfile) return fromProfile;
  }
  if (args.acceptLanguage) {
    const fromHeader = pickFromAcceptLanguage(args.acceptLanguage);
    if (fromHeader) return fromHeader;
  }
  return defaultLocale;
}

async function fetchProfileLocale(userId: string): Promise<Locale | null> {
  try {
    const { url, serviceRoleKey } = getSupabaseAdminConfig();
    const res = await fetch(
      `${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=preferred_locale&limit=1`,
      {
        method: "GET",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{
      preferred_locale: string | null;
    }>;
    const v = rows[0]?.preferred_locale;
    if (typeof v === "string" && LOCALE_SET.has(v)) {
      return v as Locale;
    }
    return null;
  } catch {
    return null;
  }
}

function pickFromAcceptLanguage(header: string): Locale | null {
  // Lightweight parse — splits "en-US,en;q=0.9,es;q=0.8" → ["en-US","en","es"]
  const tags = header
    .split(",")
    .map((piece) => piece.split(";")[0].trim().toLowerCase())
    .filter(Boolean);
  for (const tag of tags) {
    const primary = tag.split("-")[0];
    if (LOCALE_SET.has(primary)) return primary as Locale;
  }
  return null;
}
