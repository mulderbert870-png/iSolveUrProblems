import { getSupabaseAdminConfig } from "../supabaseAdmin";
import type { NotificationRow, NotificationStatus } from "./types";

const TABLE = "notifications_sent";

function headers(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

/**
 * Insert a new notification row in 'queued' state. Returns the inserted
 * row id, or null if persistence failed (logging is best-effort —
 * caller still attempts the send).
 */
export async function insertNotification(
  row: NotificationRow,
): Promise<string | null> {
  let url: string;
  let serviceRoleKey: string;
  try {
    ({ url, serviceRoleKey } = getSupabaseAdminConfig());
  } catch {
    return null;
  }

  try {
    const res = await fetch(`${url}/rest/v1/${TABLE}`, {
      method: "POST",
      headers: { ...headers(serviceRoleKey), Prefer: "return=representation" },
      body: JSON.stringify([
        {
          user_id: row.user_id ?? null,
          session_id: row.session_id ?? null,
          channel: row.channel,
          recipient: row.recipient,
          template_id: row.template_id,
          locale: row.locale ?? null,
          provider_id: row.provider_id ?? null,
          status: row.status,
          error: row.error ?? null,
          is_fallback: row.is_fallback ?? false,
          context: row.context ?? {},
        },
      ]),
    });
    if (!res.ok) {
      console.error(
        "notifications.insert: failed",
        res.status,
        await res.text().catch(() => ""),
      );
      return null;
    }
    const rows = (await res.json()) as Array<{ id: string }>;
    return rows[0]?.id ?? null;
  } catch (e) {
    console.error("notifications.insert: throw", e);
    return null;
  }
}

/**
 * Patch a notification row by id with provider id + new status.
 * Tolerates a null rowId (insert step may have failed; nothing to update).
 */
export async function updateNotificationById(
  rowId: string | null,
  patch: {
    status: NotificationStatus;
    provider_id?: string | null;
    error?: string | null;
  },
): Promise<boolean> {
  if (!rowId) return false;
  let url: string;
  let serviceRoleKey: string;
  try {
    ({ url, serviceRoleKey } = getSupabaseAdminConfig());
  } catch {
    return false;
  }
  try {
    const res = await fetch(
      `${url}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(rowId)}`,
      {
        method: "PATCH",
        headers: { ...headers(serviceRoleKey), Prefer: "return=minimal" },
        body: JSON.stringify({
          status: patch.status,
          provider_id: patch.provider_id ?? undefined,
          error: patch.error ?? null,
        }),
      },
    );
    return res.ok;
  } catch (e) {
    console.error("notifications.update: throw", e);
    return false;
  }
}

/**
 * Webhook helper — patch by provider_id. Used by /api/webhooks/* when
 * we get a 'delivered' / 'bounced' / 'opened' event.
 */
export async function updateNotificationByProviderId(
  providerId: string,
  patch: { status: NotificationStatus; error?: string | null },
): Promise<boolean> {
  if (!providerId) return false;
  let url: string;
  let serviceRoleKey: string;
  try {
    ({ url, serviceRoleKey } = getSupabaseAdminConfig());
  } catch {
    return false;
  }
  try {
    const res = await fetch(
      `${url}/rest/v1/${TABLE}?provider_id=eq.${encodeURIComponent(providerId)}`,
      {
        method: "PATCH",
        headers: { ...headers(serviceRoleKey), Prefer: "return=minimal" },
        body: JSON.stringify({
          status: patch.status,
          error: patch.error ?? null,
        }),
      },
    );
    return res.ok;
  } catch (e) {
    console.error("notifications.updateByProvider: throw", e);
    return false;
  }
}
