import { RESEND_API_KEY, RESEND_FROM_EMAIL } from "../../../../app/api/secrets";
import type { EmailRendered } from "../types";

const RESEND_URL = "https://api.resend.com/emails";

export type EmailSendResult =
  | { ok: true; providerId: string }
  | { ok: false; error: string };

/**
 * Send an email via Resend. Reads RESEND_API_KEY + RESEND_FROM_EMAIL
 * from secrets. Returns a structured result; never throws.
 */
export async function sendEmail(args: {
  to: string;
  rendered: EmailRendered;
}): Promise<EmailSendResult> {
  if (!RESEND_API_KEY) {
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }
  if (!args.to.trim()) {
    return { ok: false, error: "empty recipient" };
  }

  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: RESEND_FROM_EMAIL,
        to: [args.to],
        subject: args.rendered.subject,
        html: args.rendered.html,
        text: args.rendered.text,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      name?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        error: data.message || data.name || `resend ${res.status}`,
      };
    }
    if (!data.id) {
      return { ok: false, error: "resend response missing id" };
    }
    return { ok: true, providerId: data.id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "email send threw",
    };
  }
}
