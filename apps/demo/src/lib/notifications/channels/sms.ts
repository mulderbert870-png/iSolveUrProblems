import {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_FROM_PHONE,
} from "../../../../app/api/secrets";
import type { SmsRendered } from "../types";

export type SmsSendResult =
  | { ok: true; providerId: string }
  | { ok: false; error: string };

function twilioMessagesUrl(): string {
  return `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
}

function basicAuthHeader(): string {
  // Twilio uses HTTP basic auth: Account SID : Auth Token.
  const token = Buffer.from(
    `${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`,
  ).toString("base64");
  return `Basic ${token}`;
}

/**
 * Send an SMS via Twilio Programmable Messaging. Reads
 * TWILIO_ACCOUNT_SID / AUTH_TOKEN / FROM_PHONE from secrets.
 * Returns a structured result; never throws.
 */
export async function sendSms(args: {
  to: string;
  rendered: SmsRendered;
}): Promise<SmsSendResult> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_PHONE) {
    return { ok: false, error: "Twilio SMS not configured" };
  }
  if (!args.to.trim()) {
    return { ok: false, error: "empty recipient" };
  }

  try {
    const body = new URLSearchParams({
      To: args.to,
      From: TWILIO_FROM_PHONE,
      Body: args.rendered.body,
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
      code?: number;
    };
    if (!res.ok) {
      return {
        ok: false,
        error: data.message ?? `twilio ${res.status}`,
      };
    }
    if (!data.sid) {
      return { ok: false, error: "twilio response missing sid" };
    }
    return { ok: true, providerId: data.sid };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "sms send threw",
    };
  }
}
