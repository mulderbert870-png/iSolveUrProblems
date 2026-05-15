import { NextResponse, type NextRequest } from "next/server";
import { getUserId } from "../../../../src/lib/auth/getUser";
import { getSupabaseAdminConfig } from "../../../../src/lib/supabaseAdmin";
import { locales, type Locale } from "../../../../src/i18n/routing";

/**
 * Persist user preferences (currently just preferred_locale).
 *
 * Anonymous callers get a silent 204 — the locale is still tracked in
 * the URL + a next-intl cookie, so anonymous UX is unaffected.
 */
export async function PATCH(request: NextRequest) {
  const userId = await getUserId();
  if (!userId) {
    return new NextResponse(null, { status: 204 });
  }

  let body: { preferred_locale?: unknown } = {};
  try {
    body = (await request.json()) as { preferred_locale?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const payload: Record<string, unknown> = {};
  if (typeof body.preferred_locale === "string") {
    if (!(locales as readonly string[]).includes(body.preferred_locale)) {
      return NextResponse.json(
        { error: `unsupported locale; valid: ${locales.join(", ")}` },
        { status: 400 },
      );
    }
    payload.preferred_locale = body.preferred_locale as Locale;
  }

  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ ok: true, updated: 0 });
  }

  let url: string;
  let serviceRoleKey: string;
  try {
    ({ url, serviceRoleKey } = getSupabaseAdminConfig());
  } catch {
    return NextResponse.json({ error: "supabase not configured" }, { status: 500 });
  }

  const res = await fetch(
    `${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return NextResponse.json(
      { error: `update failed (${res.status}): ${detail}` },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
