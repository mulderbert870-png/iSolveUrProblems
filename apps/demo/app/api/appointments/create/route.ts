import { NextResponse, type NextRequest } from "next/server";
import { assertAllowedOrigin } from "../../../../src/lib/apiRouteSecurity";
import { checkRateLimit } from "../../../../src/lib/rateLimit";
import { getUserId } from "../../../../src/lib/auth/getUser";
import { createAppointment } from "../../../../src/lib/appointments";

export const dynamic = "force-dynamic";

/**
 * POST /api/appointments/create (M3.4)
 *
 * Body:
 *   {
 *     contractor_id?: uuid,
 *     contract_id?: uuid,
 *     scheduled_at: ISO string (UTC),
 *     duration_minutes?: number (default 60),
 *     agenda?: string,
 *     context?: object
 *   }
 *
 * Returns: AppointmentRow
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
    contractor_id?: unknown;
    contract_id?: unknown;
    scheduled_at?: unknown;
    duration_minutes?: unknown;
    agenda?: unknown;
    context?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return bad("invalid JSON");
  }

  if (typeof body.scheduled_at !== "string") {
    return bad("scheduled_at is required (ISO string)");
  }
  const when = new Date(body.scheduled_at);
  if (Number.isNaN(when.getTime())) {
    return bad("scheduled_at is not a valid date");
  }
  if (when.getTime() < Date.now() - 60_000) {
    return bad("scheduled_at must be in the future");
  }

  const contractorId =
    typeof body.contractor_id === "string" && UUID_RE.test(body.contractor_id)
      ? body.contractor_id
      : undefined;
  const contractId =
    typeof body.contract_id === "string" && UUID_RE.test(body.contract_id)
      ? body.contract_id
      : undefined;
  const duration =
    typeof body.duration_minutes === "number" && body.duration_minutes > 0
      ? Math.floor(Math.min(body.duration_minutes, 8 * 60))
      : 60;
  const agenda =
    typeof body.agenda === "string" ? body.agenda.slice(0, 500) : "";
  const context =
    typeof body.context === "object" && body.context !== null
      ? (body.context as Record<string, unknown>)
      : {};

  const row = await createAppointment({
    user_id: userId,
    contractor_id: contractorId,
    contract_id: contractId,
    scheduled_at: when.toISOString(),
    duration_minutes: duration,
    agenda,
    context,
  });
  if (!row) {
    return NextResponse.json(
      {
        error: "Couldn't save that appointment. Try again.",
        debug: "createAppointment returned null — see server logs",
      },
      { status: 500 },
    );
  }
  return NextResponse.json(row);
}
