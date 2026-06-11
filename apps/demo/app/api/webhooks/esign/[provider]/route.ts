import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdminConfig } from "../../../../../src/lib/supabaseAdmin";
import { getContractByEnvelopeId } from "../../../../../src/lib/payments";
import type { EsignEnvelopeStatus } from "../../../../../src/lib/esign";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/webhooks/esign/[provider] (M3.7)
 *
 * Generic e-signature webhook sink. The provider-name URL segment lets
 * us add real providers (dropbox_sign, docusign) without changing the
 * route shape — each provider's signature verification + payload parsing
 * happens in its branch below.
 *
 * v1 ships with the `mock` provider, which:
 *   - Accepts any payload shape: { envelope_id, status, role?, signed_at? }
 *   - No signature verification (mock is dev-only)
 *   - Updates the matching contracts row
 *
 * When SG Dietz hands over Dropbox Sign sandbox keys, add a `dropbox_sign`
 * branch with HMAC signature verification (mirrors the Stripe webhook
 * pattern in apps/demo/app/api/webhooks/stripe/route.ts).
 */

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

type EsignWebhookPayload = {
  envelope_id?: unknown;
  status?: unknown;
  role?: unknown;       // "user" | "contractor"
  signed_at?: unknown;  // ISO string
};

const VALID_STATUSES: EsignEnvelopeStatus[] = [
  "draft",
  "sent",
  "awaiting_signature",
  "signed",
  "declined",
  "cancelled",
  "expired",
];

async function patchContractByEnvelope(args: {
  envelope_id: string;
  status: EsignEnvelopeStatus | null;
  role: "user" | "contractor" | null;
  signed_at: string | null;
}): Promise<void> {
  const { url, serviceRoleKey } = getSupabaseAdminConfig();
  const payload: Record<string, unknown> = {};
  if (args.status) payload.esign_envelope_status = args.status;
  if (args.role && args.signed_at) {
    if (args.role === "user") payload.signed_at_user = args.signed_at;
    else payload.signed_at_contractor = args.signed_at;
  }
  if (Object.keys(payload).length === 0) return;
  await fetch(
    `${url}/rest/v1/contracts?esign_envelope_id=eq.${encodeURIComponent(
      args.envelope_id,
    )}`,
    {
      method: "PATCH",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(payload),
    },
  );
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;
  const validProviders = new Set(["mock", "dropbox_sign"]);
  if (!validProviders.has(provider)) {
    return bad(`unknown provider: ${provider}`, 404);
  }

  // Real providers will sign their payloads. The mock provider doesn't —
  // it's dev-only. When dropbox_sign lands, add HMAC verification here
  // before reading the body.
  let body: EsignWebhookPayload;
  try {
    body = (await request.json()) as EsignWebhookPayload;
  } catch {
    return bad("invalid JSON");
  }

  if (typeof body.envelope_id !== "string" || body.envelope_id.trim() === "") {
    return bad("envelope_id is required");
  }

  // Reconcile: find the contract row this envelope belongs to.
  const contract = await getContractByEnvelopeId(body.envelope_id);
  if (!contract) {
    // Real providers retry on non-2xx, but for envelopes we don't track
    // (e.g. legacy test runs) we accept and no-op.
    return NextResponse.json({ ok: true, no_match: true });
  }

  const status =
    typeof body.status === "string" &&
    (VALID_STATUSES as string[]).includes(body.status)
      ? (body.status as EsignEnvelopeStatus)
      : null;
  const role =
    body.role === "user" || body.role === "contractor" ? body.role : null;
  const signed_at =
    typeof body.signed_at === "string" ? body.signed_at : null;

  await patchContractByEnvelope({
    envelope_id: body.envelope_id,
    status,
    role,
    signed_at,
  });

  return NextResponse.json({ ok: true });
}
