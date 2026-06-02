import { NextResponse, type NextRequest } from "next/server";
import { STRIPE_WEBHOOK_SECRET } from "../../secrets";
import {
  verifyStripeSignature,
  getContractByPaymentIntent,
  getContractByCheckoutSession,
  patchContractById,
  setContractorStripeConnect,
  statusFromStripeIntentStatus,
} from "../../../../src/lib/payments";
import { runPickFanOut } from "../../../../src/lib/contractors";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/webhooks/stripe
 *
 * Handles three event families that drive M2.5 + M2.6:
 *
 *   account.updated         → sync Connect account state onto the
 *                             contractor row (payouts_enabled flag)
 *   checkout.session.completed
 *                           → link payment intent back to the contract
 *   payment_intent.succeeded
 *                           → mark contract paid, trigger M2.6 win/lose
 *                             fan-out
 *   payment_intent.payment_failed
 *                           → mark contract failed
 *   payout.paid             → audit-log only for v1
 *
 * Stripe replays on non-2xx, so this handler MUST be idempotent. The
 * unique indexes on contracts.stripe_payment_intent_id +
 * contracts.stripe_checkout_session_id give us that for free.
 */

type StripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

async function handleAccountUpdated(account: Record<string, unknown>) {
  const id = typeof account.id === "string" ? account.id : null;
  if (!id) return;
  const payouts_enabled = account.payouts_enabled === true;
  const charges_enabled = account.charges_enabled === true;
  const details_submitted = account.details_submitted === true;

  // We need to find which contractor this account is attached to.
  // The metadata.contractor_id we set during account creation makes this
  // a single-row lookup without a fan-out query.
  const metadata =
    (account.metadata as Record<string, unknown> | undefined) ?? {};
  const contractor_id =
    typeof metadata.contractor_id === "string"
      ? metadata.contractor_id
      : null;
  if (!contractor_id) {
    console.warn("stripe webhook: account.updated without contractor_id metadata", id);
    return;
  }

  await setContractorStripeConnect({
    contractor_id,
    stripe_connect_account_id: id,
    payouts_enabled: payouts_enabled && charges_enabled,
    onboarded_at: details_submitted ? new Date().toISOString() : null,
  });
}

async function handleCheckoutSessionCompleted(
  session: Record<string, unknown>,
) {
  const sessionId = typeof session.id === "string" ? session.id : null;
  const paymentIntent =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : null;
  if (!sessionId) return;
  const row = await getContractByCheckoutSession(sessionId);
  if (!row) return;
  if (!row.stripe_payment_intent_id && paymentIntent) {
    await patchContractById(row.id, {
      stripe_payment_intent_id: paymentIntent,
    });
  }
}

async function handlePaymentIntentSucceeded(
  intent: Record<string, unknown>,
) {
  const intentId = typeof intent.id === "string" ? intent.id : null;
  if (!intentId) return;
  const row = await getContractByPaymentIntent(intentId);
  if (!row) {
    console.warn("stripe webhook: succeeded intent with no contract", intentId);
    return;
  }
  if (row.status === "paid") return; // already processed (replay)

  const charges =
    (intent.charges as { data?: Array<{ transfer?: string }> } | undefined) ??
    {};
  const transferId =
    Array.isArray(charges.data) && typeof charges.data[0]?.transfer === "string"
      ? charges.data[0].transfer
      : null;

  await patchContractById(row.id, {
    status: "paid",
    stripe_transfer_id: transferId,
    paid_at: new Date().toISOString(),
  });

  // M2.6 trigger — exactly the same fan-out the /pick simulation uses.
  try {
    const homeownerLocation =
      typeof row.context.homeowner_location === "string"
        ? (row.context.homeowner_location as string)
        : null;
    await runPickFanOut({
      winnerId: row.contractor_id,
      candidateIds: row.candidate_ids,
      category: row.category,
      homeownerLocation,
      userPreferences: [],
      context: {
        contract_id: row.id,
        triggered_by: "stripe.payment_intent.succeeded",
      },
    });
  } catch (e) {
    console.error("fanOut after paid contract failed:", e);
    // Webhook still 200s — we don't want Stripe to replay just because
    // the notification fabric blinked.
  }
}

async function handlePaymentIntentFailed(intent: Record<string, unknown>) {
  const intentId = typeof intent.id === "string" ? intent.id : null;
  if (!intentId) return;
  const row = await getContractByPaymentIntent(intentId);
  if (!row) return;
  await patchContractById(row.id, {
    status: statusFromStripeIntentStatus(
      typeof intent.status === "string" ? intent.status : null,
    ),
  });
}

export async function POST(request: NextRequest) {
  if (!STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET not configured" },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const verified = verifyStripeSignature({
    rawBody,
    header: request.headers.get("stripe-signature"),
    secret: STRIPE_WEBHOOK_SECRET,
  });
  if (!verified.ok) {
    return NextResponse.json(
      { error: `signature: ${verified.error}` },
      { status: 400 },
    );
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "account.updated":
        await handleAccountUpdated(event.data.object);
        break;
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(event.data.object);
        break;
      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(event.data.object);
        break;
      case "payment_intent.payment_failed":
        await handlePaymentIntentFailed(event.data.object);
        break;
      case "payout.paid":
        // Future: audit-log for reconciliation.
        break;
      default:
        // Ignore — Stripe sends many event types; we only care about a few.
        break;
    }
  } catch (e) {
    console.error("stripe webhook handler error:", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ received: true, type: event.type });
}
