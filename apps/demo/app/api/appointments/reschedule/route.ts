import { NextResponse, type NextRequest } from "next/server";
import { assertAllowedOrigin } from "../../../../src/lib/apiRouteSecurity";
import { checkRateLimit } from "../../../../src/lib/rateLimit";
import { getUserId } from "../../../../src/lib/auth/getUser";
import { rescheduleAppointment } from "../../../../src/lib/appointments";

export const dynamic = "force-dynamic";

/**
 * POST /api/appointments/reschedule (M3.5)
 *
 * Body:
 *   {
 *     appointment_id: uuid,
 *     new_scheduled_at: ISO string (UTC),
 *     reason?: string
 *   }
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

  let body: {
    appointment_id?: unknown;
    new_scheduled_at?: unknown;
    reason?: unknown;
  };
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
  if (typeof body.new_scheduled_at !== "string") {
    return bad("new_scheduled_at is required (ISO string)");
  }
  const when = new Date(body.new_scheduled_at);
  if (Number.isNaN(when.getTime())) {
    return bad("new_scheduled_at is not a valid date");
  }
  if (when.getTime() < Date.now() - 60_000) {
    return bad("new_scheduled_at must be in the future");
  }

  const row = await rescheduleAppointment({
    appointment_id: body.appointment_id,
    user_id: userId,
    new_scheduled_at: when.toISOString(),
    reason: typeof body.reason === "string" ? body.reason : undefined,
  });
  if (!row) {
    return NextResponse.json(
      {
        error: "Couldn't find that appointment to reschedule.",
        debug: "rescheduleAppointment returned null — wrong id or not owner",
      },
      { status: 404 },
    );
  }
  return NextResponse.json(row);
}
