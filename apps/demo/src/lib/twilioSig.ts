import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { TWILIO_AUTH_TOKEN } from "../../app/api/secrets";

/**
 * Verify Twilio's `X-Twilio-Signature` header.
 *
 * Spec: HMAC-SHA1 of `${fullRequestUrl}${concatenatedSortedParams}`,
 * keyed with `TWILIO_AUTH_TOKEN`, base64-encoded. The full URL is the
 * exact URL Twilio called (including query string).
 *
 * Auth token quirk: our `.env` stores `<SID>:<token>` rather than the
 * bare token. We strip the SID prefix the same way the basic-auth
 * helpers do, so the HMAC uses just the token half.
 */

function tokenOnly(): string {
  return TWILIO_AUTH_TOKEN.includes(":")
    ? TWILIO_AUTH_TOKEN.split(":").slice(1).join(":")
    : TWILIO_AUTH_TOKEN;
}

export function verifyTwilio(args: {
  fullUrl: string;
  params: Record<string, string>;
  headerSig: string | null;
}): boolean {
  if (!args.headerSig) return false;
  const token = tokenOnly();
  if (!token) return false;
  const sortedKeys = Object.keys(args.params).sort();
  const concat = sortedKeys.reduce(
    (acc, k) => acc + k + (args.params[k] ?? ""),
    args.fullUrl,
  );
  const expected = crypto
    .createHmac("sha1", token)
    .update(concat)
    .digest("base64");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(args.headerSig),
    );
  } catch {
    return false;
  }
}

/**
 * Convenience wrapper for the M3.1 webhook routes — pulls form data
 * from the request, runs verification, and returns either `null`
 * (verified) or a NextResponse-friendly error envelope.
 *
 * The webhooks each return TwiML on success; on failure they should
 * still return 200 with empty body (per Twilio's expectations) OR a
 * 401 — Twilio's retry logic kicks on non-2xx, so we choose 401 here
 * to make tampered requests fail loud rather than silently retry.
 *
 * For QUERY-STRING-only routes (no form body), pass `params: {}`.
 */
export async function verifyTwilioRequest(args: {
  request: NextRequest;
  formParams: URLSearchParams;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!TWILIO_AUTH_TOKEN) {
    // Dev convenience — no token configured, allow through. Production
    // env MUST have TWILIO_AUTH_TOKEN set or these calls bypass auth.
    console.warn(
      "[twilioSig] TWILIO_AUTH_TOKEN unset — skipping signature verification",
    );
    return { ok: true };
  }
  const params: Record<string, string> = {};
  args.formParams.forEach((v, k) => {
    params[k] = v;
  });
  const sig = args.request.headers.get("x-twilio-signature");
  const ok = verifyTwilio({
    fullUrl: args.request.url,
    params,
    headerSig: sig,
  });
  if (!ok) return { ok: false, reason: "invalid signature" };
  return { ok: true };
}
