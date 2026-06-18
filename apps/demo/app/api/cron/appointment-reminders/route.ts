import { NextResponse, type NextRequest } from "next/server";
import { CRON_SECRET } from "../../secrets";
import { verifyAdminBearer } from "../../../../src/lib/apiRouteSecurity";
import {
  findAppointmentsDueForReminder,
  markReminderSent,
  type AppointmentRow,
} from "../../../../src/lib/appointments";
import { send } from "../../../../src/lib/notifications";
import { getSupabaseAdminConfig } from "../../../../src/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/appointment-reminders (M3.4)
 *
 * Vision ¶14: "before meetings or when work is to occur, 6 will message
 * both parties to make sure they'll be on time and ready."
 *
 * Cadence (recommended): every 15 minutes. Each pass:
 *   1. Find appointments whose 24h reminder window is open and not yet sent
 *   2. For each, send a reminder to the homeowner AND the contractor
 *   3. Mark reminder_24h_sent_at
 *   4. Same for the 2h window
 *
 * Idempotency: the reminder_*_sent_at column is the gate. Once written
 * we never re-fire. Reminder rows in notifications_sent provide audit.
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}. Without that header (or
 * with a wrong one) returns 401.
 */

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

async function fetchUserChannelTarget(
  userId: string,
): Promise<{ email: string | null; phone: string | null; name: string | null }> {
  try {
    const { url, serviceRoleKey } = getSupabaseAdminConfig();
    const res = await fetch(
      `${url}/rest/v1/users?id=eq.${encodeURIComponent(
        userId,
      )}&select=email,phone,full_name&limit=1`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        cache: "no-store",
      },
    );
    if (!res.ok) return { email: null, phone: null, name: null };
    const rows = (await res.json()) as Array<{
      email: string | null;
      phone: string | null;
      full_name: string | null;
    }>;
    const row = rows[0];
    return {
      email: row?.email ?? null,
      phone: row?.phone ?? null,
      name: row?.full_name ?? null,
    };
  } catch {
    return { email: null, phone: null, name: null };
  }
}

async function fetchContractorTarget(
  contractorId: string,
): Promise<{ email: string | null; phone: string | null; name: string }> {
  try {
    const { url, serviceRoleKey } = getSupabaseAdminConfig();
    const res = await fetch(
      `${url}/rest/v1/contractors?id=eq.${encodeURIComponent(
        contractorId,
      )}&select=email,phone,name&limit=1`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        cache: "no-store",
      },
    );
    if (!res.ok) return { email: null, phone: null, name: "contractor" };
    const rows = (await res.json()) as Array<{
      email: string | null;
      phone: string | null;
      name: string;
    }>;
    const row = rows[0];
    return {
      email: row?.email ?? null,
      phone: row?.phone ?? null,
      name: row?.name ?? "contractor",
    };
  } catch {
    return { email: null, phone: null, name: "contractor" };
  }
}

function humanTime(when: string, offsetHours: 24 | 2): string {
  const d = new Date(when);
  const opts: Intl.DateTimeFormatOptions = {
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  };
  const formatted = new Intl.DateTimeFormat("en-US", opts).format(d);
  return offsetHours === 24 ? `tomorrow, ${formatted}` : `at ${formatted}`;
}

async function sendOne(args: {
  to: string;
  channel: "email" | "sms";
  templateId: string;
  data: Record<string, unknown>;
  context: Record<string, unknown>;
}) {
  if (!args.to) return null;
  return send({
    channel: args.channel,
    recipient: args.to,
    templateId: args.templateId,
    data: args.data,
    context: args.context,
  });
}

async function dispatchAppointmentReminder(
  appointment: AppointmentRow,
  kind: "24h" | "2h",
): Promise<{
  appointment_id: string;
  user_sent: boolean;
  contractor_sent: boolean;
  errors: string[];
}> {
  const errors: string[] = [];
  const templateId = `appointment.reminder.${kind}.v1`;
  const whenText = humanTime(appointment.scheduled_at, kind === "24h" ? 24 : 2);

  // ── Homeowner ────────────────────────────────────────────────────
  const userTarget = await fetchUserChannelTarget(appointment.user_id);
  let userSent = false;
  const userTo = userTarget.email ?? userTarget.phone;
  const userChannel: "email" | "sms" = userTarget.email ? "email" : "sms";
  if (userTo) {
    const result = await sendOne({
      to: userTo,
      channel: userChannel,
      templateId,
      data: {
        recipientName: userTarget.name,
        otherPartyName: appointment.contractor_id
          ? (await fetchContractorTarget(appointment.contractor_id)).name
          : null,
        whenText,
        agenda: appointment.agenda,
      },
      context: {
        appointment_id: appointment.id,
        role: "homeowner",
        cron_kind: kind,
      },
    });
    if (result?.ok) userSent = true;
    else if (result) errors.push(`user: ${result.error}`);
  } else {
    errors.push("user has no email or phone on file");
  }

  // ── Contractor ───────────────────────────────────────────────────
  let contractorSent = false;
  if (appointment.contractor_id) {
    const ct = await fetchContractorTarget(appointment.contractor_id);
    const to = ct.email ?? ct.phone;
    const channel: "email" | "sms" = ct.email ? "email" : "sms";
    if (to) {
      const result = await sendOne({
        to,
        channel,
        templateId,
        data: {
          recipientName: ct.name,
          otherPartyName: userTarget.name,
          whenText,
          agenda: appointment.agenda,
        },
        context: {
          appointment_id: appointment.id,
          role: "contractor",
          cron_kind: kind,
        },
      });
      if (result?.ok) contractorSent = true;
      else if (result) errors.push(`contractor: ${result.error}`);
    } else {
      errors.push("contractor has no email or phone");
    }
  }

  await markReminderSent({ appointment_id: appointment.id, kind });

  return {
    appointment_id: appointment.id,
    user_sent: userSent,
    contractor_sent: contractorSent,
    errors,
  };
}

export async function GET(request: NextRequest) {
  if (!CRON_SECRET) return bad("CRON_SECRET not configured", 503);
  if (!verifyAdminBearer(request.headers.get("authorization"), CRON_SECRET).ok) {
    return bad("unauthorized", 401);
  }

  // 24h window
  const due24h = await findAppointmentsDueForReminder({ kind: "24h" });
  const results24h = await Promise.all(
    due24h.map((a: AppointmentRow) =>
      dispatchAppointmentReminder(a, "24h"),
    ),
  );

  // 2h window
  const due2h = await findAppointmentsDueForReminder({ kind: "2h" });
  const results2h = await Promise.all(
    due2h.map((a: AppointmentRow) =>
      dispatchAppointmentReminder(a, "2h"),
    ),
  );

  return NextResponse.json({
    ran_at: new Date().toISOString(),
    "24h": {
      found: due24h.length,
      results: results24h,
    },
    "2h": {
      found: due2h.length,
      results: results2h,
    },
  });
}
