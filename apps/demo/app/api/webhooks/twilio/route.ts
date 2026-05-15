import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { TWILIO_AUTH_TOKEN } from "../../secrets";
import { updateNotificationByProviderId } from "../../../../src/lib/notifications/store";
import type { NotificationStatus } from "../../../../src/lib/notifications/types";

/**
 * Twilio status-callback webhook (used by both SMS and WhatsApp).
 *
 * Twilio signs with the X-Twilio-Signature header — HMAC-SHA1 over
 * `${requestUrl}${sortedFormParams}` using AUTH_TOKEN as the key.
 *
 * If TWILIO_AUTH_TOKEN is unset, signature verification is skipped
 * with a loud warning (dev convenience only).
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

function verifyTwilio(
  fullUrl: string,
  params: Record<string, string>,
  headerSig: string | null,
  authToken: string,
): boolean {
  if (!headerSig) return false;
  const sortedKeys = Object.keys(params).sort();
  const concat = sortedKeys.reduce(
    (acc, k) => acc + k + (params[k] ?? ""),
    fullUrl,
  );
  const expected = crypto
    .createHmac("sha1", authToken)
    .update(concat)
    .digest("base64");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(headerSig),
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const formText = await request.text();
  const form = new URLSearchParams(formText);
  const params: Record<string, string> = {};
  form.forEach((v, k) => {
    params[k] = v;
  });

  if (TWILIO_AUTH_TOKEN) {
    const fullUrl = request.url; // Twilio signs the full request URL
    const sig = request.headers.get("x-twilio-signature");
    if (!verifyTwilio(fullUrl, params, sig, TWILIO_AUTH_TOKEN)) {
      return NextResponse.json(
        { error: "invalid signature" },
        { status: 401 },
      );
    }
  } else {
    console.warn(
      "[webhooks/twilio] TWILIO_AUTH_TOKEN unset — skipping verification",
    );
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
