import {
  ADMIN_ESCALATION_EMAIL,
  ADMIN_ESCALATION_SLACK_WEBHOOK_URL,
} from "../../../app/api/secrets";
import { getSupabaseAdminConfig } from "../supabaseAdmin";
import { send } from "../notifications";
import type { AdminDisputeEscalationData } from "../notifications/templates/admin-dispute-escalation";
import type { DisputeRow } from "./types";

/**
 * M3.9 / Q3.9a — Admin escalation dispatcher.
 *
 * When a dispute moves to status='escalated' (either through the rules
 * gate in resolve.ts or by an explicit /resolve POST), this fires off:
 *   1. Slack incoming-webhook ping  → if ADMIN_ESCALATION_SLACK_WEBHOOK_URL is set
 *   2. Admin email                   → if ADMIN_ESCALATION_EMAIL is set
 *
 * Both are independent — either one (or both, or neither) can be wired
 * by env. With neither, this function logs a warning and returns — the
 * escalation still persists in DB; admins can pick it up via the
 * `idx_disputes_escalated` index when they polling-check the table.
 *
 * Failures NEVER throw. The dispute row is already marked escalated by
 * the caller; the notification is a best-effort heads-up.
 */

export type EscalationContext = {
  dispute: DisputeRow;
  reason: string;
  /** Origin URL (e.g. "https://app.example.com") for deep-linking the
   *  thread. Falls back to a relative path when null. */
  app_origin: string | null;
};

type AdminUser = {
  email: string | null;
  full_name: string | null;
};

async function fetchHomeownerForEscalation(
  userId: string,
): Promise<AdminUser> {
  try {
    const { url, serviceRoleKey } = getSupabaseAdminConfig();
    const res = await fetch(
      `${url}/rest/v1/users?id=eq.${encodeURIComponent(
        userId,
      )}&select=email,full_name&limit=1`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        cache: "no-store",
      },
    );
    if (!res.ok) return { email: null, full_name: null };
    const rows = (await res.json()) as AdminUser[];
    return rows[0] ?? { email: null, full_name: null };
  } catch {
    return { email: null, full_name: null };
  }
}

async function fetchContractorName(
  contractorId: string | null,
): Promise<string | null> {
  if (!contractorId) return null;
  try {
    const { url, serviceRoleKey } = getSupabaseAdminConfig();
    const res = await fetch(
      `${url}/rest/v1/contractors?id=eq.${encodeURIComponent(
        contractorId,
      )}&select=name&limit=1`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ name: string }>;
    return rows[0]?.name ?? null;
  } catch {
    return null;
  }
}

/**
 * Build the Slack `text` body. Slack renders newlines + markdown-lite
 * (`*bold*`, `_italic_`, `<URL|text>`).
 */
function buildSlackText(args: {
  dispute: DisputeRow;
  reason: string;
  userName: string | null;
  userEmail: string | null;
  contractorName: string | null;
  threadUrl: string | null;
}): string {
  const lines: string[] = [
    `:rotating_light: *Dispute escalated — needs a human*`,
    `*Reason:* ${args.reason}`,
  ];
  if (args.userName || args.userEmail) {
    lines.push(
      `*Homeowner:* ${args.userName ?? "(unknown)"}${
        args.userEmail ? ` <${args.userEmail}>` : ""
      }`,
    );
  } else {
    lines.push(`*Homeowner ID:* \`${args.dispute.user_id}\``);
  }
  if (args.contractorName) {
    lines.push(`*Contractor:* ${args.contractorName}`);
  }
  if (args.dispute.disputed_amount_cents != null) {
    lines.push(
      `*Disputed amount:* $${(args.dispute.disputed_amount_cents / 100).toFixed(
        2,
      )}`,
    );
  }
  lines.push(`*Complaint:* ${args.dispute.complaint}`);
  lines.push(`*Dispute ID:* \`${args.dispute.id}\``);
  if (args.threadUrl) {
    lines.push(`<${args.threadUrl}|Open the full thread →>`);
  }
  return lines.join("\n");
}

async function sendSlack(text: string): Promise<{ ok: boolean; error?: string }> {
  if (!ADMIN_ESCALATION_SLACK_WEBHOOK_URL) {
    return { ok: false, error: "slack webhook not configured" };
  }
  try {
    const res = await fetch(ADMIN_ESCALATION_SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        error: `slack ${res.status}: ${body.slice(0, 200)}`,
      };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "slack fetch threw",
    };
  }
}

export type EscalationDispatchResult = {
  slack: { sent: boolean; error?: string };
  email: { sent: boolean; error?: string };
};

/**
 * Notify the admin queue about an escalated dispute. Never throws.
 */
export async function notifyAdminEscalation(
  ctx: EscalationContext,
): Promise<EscalationDispatchResult> {
  const [homeowner, contractorName] = await Promise.all([
    fetchHomeownerForEscalation(ctx.dispute.user_id),
    fetchContractorName(ctx.dispute.contractor_id),
  ]);

  const threadUrl = ctx.app_origin
    ? `${ctx.app_origin.replace(/\/$/, "")}/en/disputes/${ctx.dispute.id}`
    : null;

  const result: EscalationDispatchResult = {
    slack: { sent: false },
    email: { sent: false },
  };

  // 1. Slack incoming webhook.
  if (ADMIN_ESCALATION_SLACK_WEBHOOK_URL) {
    const text = buildSlackText({
      dispute: ctx.dispute,
      reason: ctx.reason,
      userName: homeowner.full_name,
      userEmail: homeowner.email,
      contractorName,
      threadUrl,
    });
    const r = await sendSlack(text);
    result.slack.sent = r.ok;
    if (!r.ok) result.slack.error = r.error;
  } else {
    result.slack.error = "ADMIN_ESCALATION_SLACK_WEBHOOK_URL not set";
  }

  // 2. Admin email.
  if (ADMIN_ESCALATION_EMAIL) {
    const data: AdminDisputeEscalationData = {
      disputeId: ctx.dispute.id,
      status: "escalated",
      reason: ctx.reason,
      userId: ctx.dispute.user_id,
      userEmail: homeowner.email,
      userName: homeowner.full_name,
      contractorName,
      complaint: ctx.dispute.complaint,
      disputedAmountCents: ctx.dispute.disputed_amount_cents,
      threadUrl,
    };
    const r = await send({
      channel: "email",
      recipient: ADMIN_ESCALATION_EMAIL,
      templateId: "admin.dispute.escalation.v1",
      data,
      context: { source: "m3.9_admin_escalation", dispute_id: ctx.dispute.id },
    });
    result.email.sent = r.ok;
    if (!r.ok) result.email.error = r.error;
  } else {
    result.email.error = "ADMIN_ESCALATION_EMAIL not set";
  }

  // If nothing dispatched, warn so operators can spot a misconfig.
  if (!result.slack.sent && !result.email.sent) {
    console.warn(
      "[disputes/escalate] no admin notification dispatched — set ADMIN_ESCALATION_SLACK_WEBHOOK_URL or ADMIN_ESCALATION_EMAIL",
      result,
    );
  }

  return result;
}
