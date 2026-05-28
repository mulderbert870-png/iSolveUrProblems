import {
  FEATURE_WHATSAPP,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_WHATSAPP_FROM,
} from "../../../../app/api/secrets";
import type { WhatsappRendered } from "../types";

export type WhatsappSendResult =
  | { ok: true; providerId: string }
  | { ok: false; error: string };

function twilioMessagesUrl(): string {
  return `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
}

function basicAuthHeader(): string {
  const token = Buffer.from(
    `${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`,
  ).toString("base64");
  return `Basic ${token}`;
}

/**
 * Send a WhatsApp message via Twilio's WhatsApp Business API. Uses a
 * Meta-approved template (template_name + parameters) — free-text
 * messages are only allowed inside a user-initiated 24h window.
 *
 * Gated behind FEATURE_WHATSAPP=1. While Meta BSP approval is pending,
 * this always returns ok:false with a friendly explanation so callers
 * fall back to email/SMS without crashing.
 */
export async function sendWhatsapp(args: {
  to: string;
  rendered: WhatsappRendered;
}): Promise<WhatsappSendResult> {
  if (!FEATURE_WHATSAPP) {
    return {
      ok: false,
      error: "WhatsApp channel disabled (FEATURE_WHATSAPP=0)",
    };
  }
  if (
    !TWILIO_ACCOUNT_SID ||
    !TWILIO_AUTH_TOKEN ||
    !TWILIO_WHATSAPP_FROM
  ) {
    return { ok: false, error: "Twilio WhatsApp not configured" };
  }
  if (!args.to.trim()) {
    return { ok: false, error: "empty recipient" };
  }

  // Twilio's Content API takes a ContentSid (Meta-approved template) +
  // a ContentVariables JSON map keyed by position. We pass it as a
  // single JSON form field per Twilio's docs.
  const contentVariables: Record<string, string> = {};
  args.rendered.parameters.forEach((value, i) => {
    contentVariables[String(i + 1)] = value;
  });

  try {
    const toE164 = args.to.startsWith("whatsapp:")
      ? args.to
      : `whatsapp:${args.to}`;
    const fromE164 = TWILIO_WHATSAPP_FROM.startsWith("whatsapp:")
      ? TWILIO_WHATSAPP_FROM
      : `whatsapp:${TWILIO_WHATSAPP_FROM}`;

    const body = new URLSearchParams({
      To: toE164,
      From: fromE164,
      ContentSid: args.rendered.template_name,
      ContentVariables: JSON.stringify(contentVariables),
    });

    const res = await fetch(twilioMessagesUrl(), {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    const data = (await res.json().catch(() => ({}))) as {
      sid?: string;
      message?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        error: data.message ?? `twilio whatsapp ${res.status}`,
      };
    }
    if (!data.sid) {
      return { ok: false, error: "twilio response missing sid" };
    }
    return { ok: true, providerId: data.sid };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "whatsapp send threw",
    };
  }
}
