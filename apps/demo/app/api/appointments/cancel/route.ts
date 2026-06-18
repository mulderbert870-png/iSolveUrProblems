import { NextResponse, type NextRequest } from "next/server";
import { assertAllowedOrigin } from "../../../../src/lib/apiRouteSecurity";
import { checkRateLimit } from "../../../../src/lib/rateLimit";
import { getUserId } from "../../../../src/lib/auth/getUser";
import { cancelAppointment } from "../../../../src/lib/appointments";

export const dynamic = "force-dynamic";

/**
 * POST /api/appointments/cancel (M3.4)
 *
 * Soft-delete via status='cancelled'; row stays for audit.
 *
 * Body:
 *   { appointment_id: uuid, reason?: string }
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

export async function POST(request: NextRequest) {
  const originErr = assertAllowedOrigin(request);
  if (originErr) return originErr;
  const rateLimitErr = await checkRateLimit(request);
  if (rateLimitErr) return rateLimitErr;

  const userId = await getUserId();
  if (!userId) return bad("sign-in required", 401);

  let body: { appointment_id?: unknown; reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return bad("invalid JSON");
  }
  if (
    typeof body.appointment_id !== "string" ||
    !UUID_RE.test(body.appointment_id)
  ) {
    return bad("appointment_id is required (uuid)");
  }

  const row = await cancelAppointment({
    appointment_id: body.appointment_id,
    user_id: userId,
    reason: typeof body.reason === "string" ? body.reason : undefined,
  });
  if (!row) {
    return bad("appointment not found or not yours", 404);
  }
  return NextResponse.json(row);
}
