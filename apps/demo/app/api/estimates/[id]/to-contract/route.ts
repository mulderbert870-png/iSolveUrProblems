import { NextResponse, type NextRequest } from "next/server";
import { assertAllowedOrigin } from "../../../../../src/lib/apiRouteSecurity";
import { checkRateLimit } from "../../../../../src/lib/rateLimit";
import { getUserId } from "../../../../../src/lib/auth/getUser";
import { PLATFORM_CURRENCY, PLATFORM_FEE_PERCENT } from "../../../../api/secrets";
import {
  computePlatformFeeCents,
  getContractorStripeRow,
  insertContract,
  setContractEsign,
} from "../../../../../src/lib/payments";
import {
  getEsignProvider,
  getProviderNameFromEnv,
} from "../../../../../src/lib/esign";
import { getEstimateById } from "../../../../../src/lib/calls";
import { getSupabaseAdminConfig } from "../../../../../src/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/estimates/[id]/to-contract  (M3.6 → M3.7)
 *
 * One-tap "turn this estimate into a signed contract" — closes the loop
 * from voice estimate to delivery (Vision ¶17).
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

async function fetchHomeowner(
  userId: string,
): Promise<{ name: string; email: string | null }> {
  try {
    const { url, serviceRoleKey } = getSupabaseAdminConfig();
    const res = await fetch(
      `${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=email,display_name&limit=1`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        cache: "no-store",
      },
    );
    if (!res.ok) return { name: "Homeowner", email: null };
    const rows = (await res.json()) as Array<{
      email: string | null;
      display_name: string | null;
    }>;
    const row = rows[0];
    return {
      name: row?.display_name ?? "Homeowner",
      email: row?.email ?? null,
    };
  } catch {
    return { name: "Homeowner", email: null };
  }
}

function buildContractBody(args: {
  homeownerName: string;
  contractorName: string;
  scope: string;
  amountCents: number;
  currency: string;
  platformFeeCents: number;
}): string {
  const dollars = (args.amountCents / 100).toFixed(2);
  const feeDollars = (args.platformFeeCents / 100).toFixed(2);
  const c = args.currency.toUpperCase();
  return [
    `WORK AGREEMENT`,
    ``,
    `Between: ${args.homeownerName} ("Homeowner")`,
    `And:     ${args.contractorName} ("Contractor")`,
    ``,
    `Scope of Work:`,
    args.scope,
    ``,
    `Total Compensation: ${dollars} ${c}`,
    `Platform Fee (deducted): ${feeDollars} ${c} (iSolveUrProblems)`,
    ``,
    `Both parties agree that:`,
    `  - Work will be performed in a workmanlike manner.`,
    `  - Payment will be released through the iSolveUrProblems platform.`,
    `  - Disputes will be handled per the iSolveUrProblems Terms of Service.`,
    `  - This agreement is enforceable as a written contract upon both signatures.`,
    ``,
    `By signing below, both parties acknowledge and agree to these terms.`,
  ].join("\n");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const originErr = assertAllowedOrigin(request);
  if (originErr) return originErr;
  const rateLimitErr = await checkRateLimit(request);
  if (rateLimitErr) return rateLimitErr;

  const userId = await getUserId();
  if (!userId) return bad("sign-in required", 401);

  const { id: estimateId } = await params;
  if (!UUID_RE.test(estimateId)) return bad("invalid estimate id");

  const estimate = await getEstimateById(estimateId);
  if (!estimate) return bad("estimate not found", 404);
  if (estimate.user_id !== userId) return bad("forbidden", 403);
  if (!estimate.contractor_id)
    return bad("estimate has no contractor — can't draft a contract", 422);
  if (estimate.total_cents <= 0)
    return bad("estimate total is zero — can't draft a contract", 422);

  const contractor = await getContractorStripeRow(estimate.contractor_id);
  if (!contractor) return bad("contractor row missing", 404);

  const homeowner = await fetchHomeowner(userId);
  const platformFeeCents = computePlatformFeeCents(
    estimate.total_cents,
    PLATFORM_FEE_PERCENT,
  );

  const scope = (estimate.scope_summary || "Work agreed during phone call").slice(
    0,
    2000,
  );

  // 1. Insert contract row.
  let contract;
  try {
    contract = await insertContract({
      user_id: userId,
      contractor_id: estimate.contractor_id,
      category: "general",
      amount_cents: estimate.total_cents,
      platform_fee_cents: platformFeeCents,
      currency: PLATFORM_CURRENCY,
      candidate_ids: [],
      context: {
        source: "m3.6_estimate_to_contract",
        estimate_id: estimate.id,
        line_items: estimate.line_items,
        scope,
      },
    });
  } catch (e) {
    return bad(
      e instanceof Error ? e.message : "contract insert failed",
      500,
    );
  }

  // 2. Build doc body + dispatch e-sign envelope.
  const docBody = buildContractBody({
    homeownerName: homeowner.name,
    contractorName: contractor.name,
    scope,
    amountCents: estimate.total_cents,
    currency: PLATFORM_CURRENCY,
    platformFeeCents,
  });

  const provider = getEsignProvider();
  const env = await provider.createEnvelope({
    contract_id: contract.id,
    title: `Work agreement — ${contractor.name}`,
    body: docBody,
    signers: [
      { role: "user", name: homeowner.name, email: homeowner.email },
      { role: "contractor", name: contractor.name, email: contractor.email },
    ],
    return_url: new URL(`/checkout/${contract.id}?ok=1`, request.url).toString(),
  });

  if (!env.ok) {
    return bad(`esign provider failed: ${env.error}`, 502);
  }

  await setContractEsign({
    contract_id: contract.id,
    user_id: userId,
    esign_provider: getProviderNameFromEnv(),
    esign_envelope_id: env.envelope_id,
    esign_envelope_status: env.status,
    esign_signing_url_user: env.signing_url_by_role.user,
    esign_signing_url_contractor: env.signing_url_by_role.contractor,
    scope,
    stamp_signed_now: env.status === "signed",
  });

  return NextResponse.json({
    contract: {
      contract_id: contract.id,
      contractor_name: contractor.name,
      scope,
      amount_cents: estimate.total_cents,
      platform_fee_cents: platformFeeCents,
      currency: PLATFORM_CURRENCY,
      envelope: {
        provider: getProviderNameFromEnv(),
        envelope_id: env.envelope_id,
        status: env.status,
        signing_url_user: env.signing_url_by_role.user,
        signing_url_contractor: env.signing_url_by_role.contractor,
      },
    },
  });
}
