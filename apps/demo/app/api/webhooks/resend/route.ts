import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { RESEND_WEBHOOK_SECRET } from "../../secrets";
import { updateNotificationByProviderId } from "../../../../src/lib/notifications/store";
import type { NotificationStatus } from "../../../../src/lib/notifications/types";

/**
 * Resend webhook receiver.
 *
 * Resend signs payloads with Svix-style headers
 * (`svix-id`, `svix-timestamp`, `svix-signature`). The signature is an
 * HMAC-SHA256 over `${id}.${timestamp}.${body}` using the webhook
 * secret base64-decoded.
 *
 * If RESEND_WEBHOOK_SECRET is unset we skip verification (dev-only
 * convenience) but log a loud warning.
 */

const TYPE_TO_STATUS: Record<string, NotificationStatus | undefined> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "queued",
  "email.bounced": "bounced",
  "email.complained": "spam",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.unsubscribed": "unsubscribed",
};

function verifySvix(
  body: string,
  headers: Headers,
  secret: string,
): boolean {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const sigHeader = headers.get("svix-signature");
  if (!id || !timestamp || !sigHeader) return false;

  // Secret format: "whsec_<base64>" — strip the prefix.
  const cleaned = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let key: Buffer;
  try {
    key = Buffer.from(cleaned, "base64");
  } catch {
    return false;
  }

  const signed = `${id}.${timestamp}.${body}`;
  const expected = crypto
    .createHmac("sha256", key)
    .update(signed)
    .digest("base64");
  // svix-signature is a space-separated list like "v1,<sig> v1,<sig>"
  const candidates = sigHeader
    .split(" ")
    .map((s) => s.split(",")[1])
    .filter((s): s is string => Boolean(s));
  return candidates.some((c) => {
    try {
      return crypto.timingSafeEqual(
        Buffer.from(expected),
        Buffer.from(c),
      );
    } catch {
      return false;
    }
  });
}

export async function POST(request: NextRequest) {
  const raw = await request.text();

  if (RESEND_WEBHOOK_SECRET) {
    if (!verifySvix(raw, request.headers, RESEND_WEBHOOK_SECRET)) {
      return NextResponse.json(
        { error: "invalid signature" },
        { status: 401 },
      );
    }
  } else {
    console.warn(
      "[webhooks/resend] RESEND_WEBHOOK_SECRET unset — skipping verification",
    );
  }

  let event: { type?: string; data?: { email_id?: string } };
  try {
    event = JSON.parse(raw) as typeof event;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const status = event.type ? TYPE_TO_STATUS[event.type] : undefined;
  const providerId = event.data?.email_id;
  if (status && providerId) {
    await updateNotificationByProviderId(providerId, { status });
  }
  return NextResponse.json({ ok: true });
}
