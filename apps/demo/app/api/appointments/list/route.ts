import { NextResponse, type NextRequest } from "next/server";
import { assertAllowedOrigin } from "../../../../src/lib/apiRouteSecurity";
import { checkRateLimit } from "../../../../src/lib/rateLimit";
import { getUserId } from "../../../../src/lib/auth/getUser";
import { listUpcomingAppointments } from "../../../../src/lib/appointments";

export const dynamic = "force-dynamic";

/**
 * GET /api/appointments/list?limit=10 (M3.4)
 *
 * Returns the user's upcoming (scheduled or rescheduled) appointments,
 * sorted by scheduled_at ascending.
 */

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

export async function GET(request: NextRequest) {
  const originErr = assertAllowedOrigin(request);
  if (originErr) return originErr;
  const rateLimitErr = await checkRateLimit(request);
  if (rateLimitErr) return rateLimitErr;

  const userId = await getUserId();
  if (!userId) return bad("sign-in required", 401);

  const limitRaw = request.nextUrl.searchParams.get("limit");
  const limit =
    limitRaw && !Number.isNaN(parseInt(limitRaw, 10))
      ? parseInt(limitRaw, 10)
      : 10;

  const rows = await listUpcomingAppointments({ user_id: userId, limit });
  return NextResponse.json({ appointments: rows, count: rows.length });
}
