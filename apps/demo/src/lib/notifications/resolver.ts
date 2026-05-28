import { getSupabaseAdminConfig } from "../supabaseAdmin";
import { FEATURE_WHATSAPP } from "../../../app/api/secrets";
import type {
  NotificationChannel,
  NotificationContentType,
  ResolvedChannel,
} from "./types";

const FALLBACK_ORDER: readonly NotificationChannel[] = [
  "email",
  "sms",
  "whatsapp",
];

type UserChannelProfile = {
  email: string | null;
  phone: string | null;
  preferred_channel: NotificationChannel | null;
  sms_consent: boolean;
  whatsapp_consent: boolean;
};

async function fetchUserChannelProfile(
  userId: string,
): Promise<UserChannelProfile | null> {
  let url: string;
  let serviceRoleKey: string;
  try {
    ({ url, serviceRoleKey } = getSupabaseAdminConfig());
  } catch {
    return null;
  }

  try {
    const res = await fetch(
      `${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=email,phone,preferred_channels&limit=1`,
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
      email: string | null;
      phone: string | null;
      preferred_channels: Record<string, unknown> | null;
    }>;
    const row = rows[0];
    if (!row) return null;

    const pc = row.preferred_channels ?? {};
    const preferred = pc.preferred;
    const preferredCh: NotificationChannel | null =
      preferred === "email" || preferred === "sms" || preferred === "whatsapp"
        ? preferred
        : null;
    return {
      email: row.email,
      phone: row.phone,
      preferred_channel: preferredCh,
      sms_consent: pc.sms_consent === true,
      whatsapp_consent: pc.whatsapp_consent === true,
    };
  } catch {
    return null;
  }
}

function channelRecipient(
  profile: UserChannelProfile,
  channel: NotificationChannel,
): string | null {
  if (channel === "email") return profile.email;
  if (channel === "sms") return profile.phone;
  if (channel === "whatsapp") return profile.phone;
  return null;
}

function channelAllowed(
  profile: UserChannelProfile,
  channel: NotificationChannel,
): { ok: true } | { ok: false; reason: string } {
  if (!channelRecipient(profile, channel)) {
    return { ok: false, reason: `no ${channel} recipient on profile` };
  }
  if (channel === "sms" && !profile.sms_consent) {
    return { ok: false, reason: "no SMS consent" };
  }
  if (channel === "whatsapp" && !FEATURE_WHATSAPP) {
    return { ok: false, reason: "whatsapp feature flag off" };
  }
  if (channel === "whatsapp" && !profile.whatsapp_consent) {
    return { ok: false, reason: "no WhatsApp consent" };
  }
  return { ok: true };
}

/**
 * Pick a notification channel for a user + content type.
 *
 * Strategy:
 *   1. If caller passes an `override`, try that first.
 *   2. Otherwise try the user's preferred_channel.
 *   3. Walk FALLBACK_ORDER until we find one that's allowed (consent +
 *      recipient on file).
 *   4. If nothing works, return channel='email' with recipient=null —
 *      caller treats that as "we have nowhere to send."
 *
 * Per Q1.7b — fail-open: if SMS consent missing, silently fall back
 * to email and tag is_fallback in the audit row. The `usedFallback`
 * + `fallbackReason` fields surface that fact to the caller.
 */
export async function resolveChannel(args: {
  userId: string;
  contentType: NotificationContentType;
  override?: NotificationChannel;
}): Promise<ResolvedChannel> {
  const profile = await fetchUserChannelProfile(args.userId);
  if (!profile) {
    return {
      channel: "email",
      recipient: null,
      usedFallback: false,
      fallbackReason: "profile lookup failed",
    };
  }

  // Marketing is email-only (regulatory hygiene); ignore override.
  if (args.contentType === "marketing") {
    return {
      channel: "email",
      recipient: profile.email,
      usedFallback: false,
    };
  }

  const preferredOrder: NotificationChannel[] = [];
  if (args.override) preferredOrder.push(args.override);
  if (
    profile.preferred_channel &&
    !preferredOrder.includes(profile.preferred_channel)
  ) {
    preferredOrder.push(profile.preferred_channel);
  }
  for (const c of FALLBACK_ORDER) {
    if (!preferredOrder.includes(c)) preferredOrder.push(c);
  }

  const tried: string[] = [];
  for (let i = 0; i < preferredOrder.length; i++) {
    const c = preferredOrder[i];
    const check = channelAllowed(profile, c);
    if (check.ok) {
      const isFallback = i > 0;
      return {
        channel: c,
        recipient: channelRecipient(profile, c),
        usedFallback: isFallback,
        fallbackReason: isFallback ? tried.join("; ") : undefined,
      };
    }
    tried.push(`${c}: ${check.reason}`);
  }

  return {
    channel: "email",
    recipient: null,
    usedFallback: true,
    fallbackReason: tried.join("; ") || "no allowed channel",
  };
}
