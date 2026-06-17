import { NextResponse, type NextRequest } from "next/server";
import { verifyTwilioRequest } from "../../../../src/lib/twilioSig";
import { updateNotificationByProviderId } from "../../../../src/lib/notifications/store";
import type { NotificationStatus } from "../../../../src/lib/notifications/types";

/**
 * Twilio status-callback webhook (used by both SMS and WhatsApp).
 *
 * Twilio signs with the X-Twilio-Signature header — HMAC-SHA1 over
 * `${requestUrl}${sortedFormParams}` using AUTH_TOKEN as the key.
 * Verification is shared with the M3.1 voice webhooks via
 * `src/lib/twilioSig.ts`.
 */

const STATUS_MAP: Record<string, NotificationStatus | undefined> = {
  queued: "queued",
  sending: "sent",
  sent: "sent",
  delivered: "delivered",
  undelivered: "failed",
  failed: "failed",
  read: "opened",
};

export async function POST(request: NextRequest) {
  const formText = await request.text();
  const form = new URLSearchParams(formText);
  const params: Record<string, string> = {};
  form.forEach((v, k) => {
    params[k] = v;
  });

  const verified = await verifyTwilioRequest({ request, formParams: form });
  if (!verified.ok) {
    return NextResponse.json({ error: verified.reason }, { status: 401 });
  }

  const sid = params.MessageSid || params.SmsSid;
  const twilioStatus = (params.MessageStatus || params.SmsStatus || "").toLowerCase();
  const status = STATUS_MAP[twilioStatus];
  const errorCode = params.ErrorCode || null;
  const errorMsg = params.ErrorMessage || null;

  if (sid && status) {
    await updateNotificationByProviderId(sid, {
      status,
      error:
        status === "failed"
          ? (errorMsg ?? errorCode ?? "twilio failure")
          : null,
    });
  }

  // Twilio expects a 200 (preferably empty / TwiML); JSON is fine too.
  return NextResponse.json({ ok: true });
}
