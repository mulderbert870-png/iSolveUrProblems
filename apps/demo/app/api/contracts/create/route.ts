import { NextResponse, type NextRequest } from "next/server";
import { assertAllowedOrigin } from "../../../../src/lib/apiRouteSecurity";
import { checkRateLimit } from "../../../../src/lib/rateLimit";
import { getUserId } from "../../../../src/lib/auth/getUser";
import {
  PLATFORM_CURRENCY,
  PLATFORM_FEE_PERCENT,
  STRIPE_CHECKOUT_RETURN_PATH,
} from "../../../api/secrets";
import { searchContractors } from "../../../../src/lib/contractors";
import {
  isStripeConfigured,
  createCheckoutSession,
  insertContract,
  patchContractById,
  computePlatformFeeCents,
  getContractorStripeRow,
} from "../../../../src/lib/payments";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/contracts/create
 *
 * Vision ¶21 — "iSolve makes a cut of every contract".
 *
 * Body:
 *   {
 *     winner_id: uuid,                 // chosen contractor
 *     category: string,                // template / contract memo
 *     amount_cents: number,            // total the homeowner pays
 *     homeowner_location?: string,
 *     // EITHER explicit candidate set:
 *     candidate_ids?: uuid[],
 *     // OR a search target the server re-runs to derive candidates:
 *     search?: {
 *       category, near:{lat,lng}, radius_km?, min_rating?,
 *       max_price_tier?, locally_owned?, same_day?
 *     }
 *   }
 *
 * Returns: { checkout_url: string, contract_id: uuid }
 *
 * If Stripe is not configured, returns 503 with a clear message — the
 * UI surfaces this to the homeowner.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN_AMOUNT_CENTS = 100;          // $1 minimum (Stripe floor for usd)
const MAX_AMOUNT_CENTS = 5_000_000;    // $50k ceiling for v1 sanity

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

function abs(req: NextRequest, path: string): string {
  return new URL(path, req.url).toString();
}

export async function POST(request: NextRequest) {
  const originErr = assertAllowedOrigin(request);
  if (originErr) return originErr;
  const rateLimitErr = await checkRateLimit(request);
  if (rateLimitErr) return rateLimitErr;

  if (!isStripeConfigured()) {
    return bad(
      "Payments not yet configured by the platform owner. Try again once Stripe keys are in place.",
      503,
    );
  }

  const userId = await getUserId();
  if (!userId) return bad("sign-in required", 401);

  let body: {
    winner_id?: unknown;
    category?: unknown;
    amount_cents?: unknown;
    homeowner_location?: unknown;
    candidate_ids?: unknown;
    search?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return bad("invalid JSON");
  }

  if (typeof body.winner_id !== "string" || !UUID_RE.test(body.winner_id)) {
    return bad("winner_id is required (uuid)");
  }
  if (typeof body.category !== "string" || body.category.trim() === "") {
    return bad("category is required");
  }
  if (
    typeof body.amount_cents !== "number" ||
    !Number.isFinite(body.amount_cents) ||
    body.amount_cents < MIN_AMOUNT_CENTS ||
    body.amount_cents > MAX_AMOUNT_CENTS
  ) {
    return bad(
      `amount_cents must be between ${MIN_AMOUNT_CENTS} and ${MAX_AMOUNT_CENTS}`,
    );
  }
  const amountCents = Math.floor(body.amount_cents);

  // 1. Resolve the candidate set
  let candidateIds: string[];
  if (Array.isArray(body.candidate_ids)) {
    candidateIds = body.candidate_ids
      .filter((x): x is string => typeof x === "string" && UUID_RE.test(x))
      .slice(0, 50);
  } else if (typeof body.search === "object" && body.search !== null) {
    const s = body.search as Record<string, unknown>;
    if (
      typeof s.category !== "string" ||
      typeof s.near !== "object" ||
      s.near === null ||
      typeof (s.near as { lat?: unknown }).lat !== "number" ||
      typeof (s.near as { lng?: unknown }).lng !== "number"
    ) {
      return bad("search.category and search.near are required");
    }
    const searchRes = await searchContractors({
      category: s.category,
      near: s.near as { lat: number; lng: number },
      radius_km: typeof s.radius_km === "number" ? s.radius_km : undefined,
      min_rating: typeof s.min_rating === "number" ? s.min_rating : undefined,
      max_price_tier:
        typeof s.max_price_tier === "number"
          ? (s.max_price_tier as 1 | 2 | 3 | 4)
          : undefined,
      locally_owned:
        typeof s.locally_owned === "boolean" ? s.locally_owned : undefined,
      same_day: typeof s.same_day === "boolean" ? s.same_day : undefined,
      limit: 50,
    });
    if (searchRes.error) {
      return bad(searchRes.error, 502);
    }
    candidateIds = searchRes.hits.map((h) => h.id);
  } else {
    return bad("either candidate_ids or search is required");
  }
  if (!candidateIds.includes(body.winner_id)) {
    candidateIds = [body.winner_id, ...candidateIds];
  }

  // 2. Look up the winner & verify they can receive payouts
  const winner = await getContractorStripeRow(body.winner_id);
  if (!winner) return bad("contractor not found", 404);
  if (!winner.stripe_connect_account_id || !winner.payouts_enabled) {
    return bad(
      "This contractor hasn't completed payouts onboarding yet — pick someone else or try again later.",
      409,
    );
  }

  // 3. Insert pending contract row
  const platformFeeCents = computePlatformFeeCents(
    amountCents,
    PLATFORM_FEE_PERCENT,
  );
  let contract;
  try {
    contract = await insertContract({
      user_id: userId,
      contractor_id: body.winner_id,
      category: body.category.trim(),
      amount_cents: amountCents,
      platform_fee_cents: platformFeeCents,
      currency: PLATFORM_CURRENCY,
      candidate_ids: candidateIds,
      context: {
        homeowner_location:
          typeof body.homeowner_location === "string"
            ? body.homeowner_location
            : null,
        platform_fee_percent: PLATFORM_FEE_PERCENT,
      },
    });
  } catch (e) {
    return bad(e instanceof Error ? e.message : "contracts insert failed", 500);
  }

  // 4. Create Stripe Checkout Session
  const successUrl = abs(
    request,
    `${STRIPE_CHECKOUT_RETURN_PATH}/${contract.id}?ok=1`,
  );
  const cancelUrl = abs(
    request,
    `${STRIPE_CHECKOUT_RETURN_PATH}/${contract.id}?ok=0`,
  );
  const session = await createCheckoutSession({
    amountCents,
    applicationFeeCents: platformFeeCents,
    currency: PLATFORM_CURRENCY,
    successUrl,
    cancelUrl,
    destinationAccountId: winner.stripe_connect_account_id,
    productName: `${body.category.trim()} — via iSolveUrProblems`,
    metadata: {
      contract_id: contract.id,
      user_id: userId,
      contractor_id: body.winner_id,
    },
  });

  if (!session.ok) {
    await patchContractById(contract.id, {
      status: "failed",
      context: { ...contract.context, stripe_error: session.error },
    }).catch(() => undefined);
    return bad(`stripe checkout failed: ${session.error}`, 502);
  }

  await patchContractById(contract.id, {
    stripe_checkout_session_id: session.data.id,
    stripe_payment_intent_id: session.data.payment_intent,
  });

  return NextResponse.json({
    contract_id: contract.id,
    checkout_url: session.data.url,
  });
}
