import { NextResponse } from "next/server";
import { getUserId } from "../../../../src/lib/auth/getUser";
import { getSupabaseAdminConfig } from "../../../../src/lib/supabaseAdmin";

/**
 * GET /api/user/profile — return the current user's profile row.
 *
 * Used by the report delivery panel to pre-fill channel pickers,
 * phone field, and consent state. Anonymous → 204.
 */
export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return new NextResponse(null, { status: 204 });
  }

  let url: string;
  let serviceRoleKey: string;
  try {
    ({ url, serviceRoleKey } = getSupabaseAdminConfig());
  } catch {
    return NextResponse.json({ error: "supabase not configured" }, { status: 500 });
  }

  const res = await fetch(
    `${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=email,phone,full_name,preferred_locale,preferred_channels&limit=1`,
    {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  );
  if (!res.ok) {
    return NextResponse.json(
      { error: `profile lookup failed (${res.status})` },
      { status: 500 },
    );
  }
  const rows = (await res.json()) as Array<{
    email: string | null;
    phone: string | null;
    full_name: string | null;
    preferred_locale: string | null;
    preferred_channels: Record<string, unknown> | null;
  }>;
  const row = rows[0];
  if (!row) {
    return NextResponse.json(
      {
        email: null,
        phone: null,
        full_name: null,
        preferred_locale: null,
        preferred_channels: {},
      },
      { status: 200 },
    );
  }
  return NextResponse.json({
    email: row.email,
    phone: row.phone,
    full_name: row.full_name,
    preferred_locale: row.preferred_locale,
    preferred_channels: row.preferred_channels ?? {},
  });
}
