import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stripe webhook signature verification.
 *
 * Stripe sends a `Stripe-Signature` header of the form:
 *   t=<timestamp>,v1=<hex hmac sha256>,v1=<...>,v0=<deprecated>
 *
 * Verification:
 *   signed_payload = `${t}.${rawBody}`
 *   expected = HMAC-SHA256(signed_payload, webhook_secret)  // hex
 *   any of the v1 values must equal expected (constant-time)
 *
 * The timestamp window (5 min) protects against replay. Returns true
 * only on success.
 */

const REPLAY_WINDOW_SECONDS = 5 * 60;

function parseSigHeader(
  header: string,
): { timestamp: number | null; v1: string[] } {
  const parts = header.split(",");
  let timestamp: number | null = null;
  const v1: string[] = [];
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k === "t") {
      const n = Number(v);
      timestamp = Number.isFinite(n) ? n : null;
    } else if (k === "v1") {
      v1.push(v);
    }
  }
  return { timestamp, v1 };
}

function safeEqHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

export function verifyStripeSignature(args: {
  rawBody: string;
  header: string | null;
  secret: string;
  /** Tolerance override for testing — defaults to 5 minutes. */
  toleranceSeconds?: number;
  /** Clock override for testing — defaults to Date.now(). */
  nowMs?: number;
}): { ok: true } | { ok: false; error: string } {
  if (!args.secret) return { ok: false, error: "no webhook secret configured" };
  if (!args.header) return { ok: false, error: "missing Stripe-Signature header" };

  const parsed = parseSigHeader(args.header);
  if (parsed.timestamp == null) {
    return { ok: false, error: "no t= in signature header" };
  }
  if (parsed.v1.length === 0) {
    return { ok: false, error: "no v1= in signature header" };
  }

  const tolerance = args.toleranceSeconds ?? REPLAY_WINDOW_SECONDS;
  const nowSec = Math.floor((args.nowMs ?? Date.now()) / 1000);
  if (Math.abs(nowSec - parsed.timestamp) > tolerance) {
    return { ok: false, error: "timestamp outside tolerance" };
  }

  const expected = createHmac("sha256", args.secret)
    .update(`${parsed.timestamp}.${args.rawBody}`, "utf8")
    .digest("hex");

  for (const sig of parsed.v1) {
    if (safeEqHex(sig, expected)) return { ok: true };
  }
  return { ok: false, error: "signature mismatch" };
}
