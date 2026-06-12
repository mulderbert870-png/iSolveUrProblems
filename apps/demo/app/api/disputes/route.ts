import { NextResponse, type NextRequest } from "next/server";
import { assertAllowedOrigin } from "../../../src/lib/apiRouteSecurity";
import { checkRateLimit } from "../../../src/lib/rateLimit";
import { getUserId } from "../../../src/lib/auth/getUser";
import {
  appendDisputeMessage,
  createDispute,
  decideMediatorAction,
  getDisputeById,
  notifyAdminEscalation,
  patchDispute,
  setDisputeStatus,
  type DisputeMessageRow,
} from "../../../src/lib/disputes";
import { getContractById } from "../../../src/lib/payments";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/disputes  (M3.9)
 *
 * Opens a new dispute thread and triggers 6's opening response.
 *
 * Body:
 *   {
 *     contract_id?: uuid,
 *     contractor_id?: uuid,
 *     complaint: string,                   // required
 *     disputed_amount_cents?: number,
 *   }
 *
 * Returns:
 *   {
 *     dispute_id: uuid,
 *     opening_message: { id, body, kind },
 *     status: DisputeStatus,
 *   }
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

export async function POST(request: NextRequest) {
  const originErr = assertAllowedOrigin(request);
  if (originErr) return originErr;
  const rateLimitErr = await checkRateLimit(request);
  if (rateLimitErr) return rateLimitErr;

  const userId = await getUserId();
  if (!userId) return bad("sign-in required", 401);

  let body: {
    contract_id?: unknown;
    contractor_id?: unknown;
    complaint?: unknown;
    disputed_amount_cents?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return bad("invalid JSON");
  }

  if (typeof body.complaint !== "string" || body.complaint.trim() === "") {
    return bad("complaint is required (non-empty string)");
  }
  if (body.contract_id != null) {
    if (typeof body.contract_id !== "string" || !UUID_RE.test(body.contract_id)) {
      return bad("contract_id must be a uuid");
    }
  }
  if (body.contractor_id != null) {
    if (
      typeof body.contractor_id !== "string" ||
      !UUID_RE.test(body.contractor_id)
    ) {
      return bad("contractor_id must be a uuid");
    }
  }
  let amountCents: number | null = null;
  if (body.disputed_amount_cents != null) {
    if (
      typeof body.disputed_amount_cents !== "number" ||
      !Number.isInteger(body.disputed_amount_cents) ||
      body.disputed_amount_cents < 0
    ) {
      return bad("disputed_amount_cents must be a non-negative integer");
    }
    amountCents = body.disputed_amount_cents;
  }

  // Derive contractor + amount from the contract if a contract_id was passed
  // and the caller didn't pin them explicitly. Keeps the voice-driven path
  // ergonomic.
  let contractorId =
    typeof body.contractor_id === "string" ? body.contractor_id : null;
  if (typeof body.contract_id === "string") {
    const contract = await getContractById(body.contract_id, userId).catch(
      () => null,
    );
    if (contract) {
      if (!contractorId) contractorId = contract.contractor_id ?? null;
      if (amountCents == null) amountCents = contract.amount_cents ?? null;
    }
  }

  const dispute = await createDispute({
    user_id: userId,
    contract_id:
      typeof body.contract_id === "string" ? body.contract_id : null,
    contractor_id: contractorId,
    complaint: body.complaint.trim(),
    disputed_amount_cents: amountCents,
    context: { source: "api_post" },
  });
  if (!dispute) return bad("failed to create dispute", 500);

  // Record the opening user message verbatim so the thread is complete.
  await appendDisputeMessage({
    dispute_id: dispute.id,
    sender: "user",
    body: body.complaint.trim(),
    kind: "message",
  });

  // Mediator opens with its first reply.
  const decision = await decideMediatorAction({
    dispute,
    thread: [],
    contract: null,
    latestUserMessage: body.complaint.trim(),
  });

  let openingMessage: DisputeMessageRow | null;
  if (decision.kind === "escalate") {
    openingMessage = await appendDisputeMessage({
      dispute_id: dispute.id,
      sender: "mediator",
      body: decision.body,
      kind: "escalation_notice",
      context: { reason: decision.reason },
    });
    await setDisputeStatus(dispute.id, "escalated", {
      kind: "human_escalation",
      summary: decision.reason,
    });
    const refreshed = (await getDisputeById(dispute.id)) ?? dispute;
    await notifyAdminEscalation({
      dispute: refreshed,
      reason: decision.reason,
      app_origin: new URL(request.url).origin,
    });
  } else {
    openingMessage = await appendDisputeMessage({
      dispute_id: dispute.id,
      sender: "mediator",
      body: decision.body,
      kind: decision.message_kind,
      context: decision.proposed_resolution
        ? { proposed_resolution: decision.proposed_resolution }
        : {},
    });
    await patchDispute(dispute.id, {
      status: "awaiting_user",
      mediator_turn_count: 1,
    });
  }

  return NextResponse.json({
    dispute_id: dispute.id,
    status: decision.kind === "escalate" ? "escalated" : "awaiting_user",
    opening_message: openingMessage
      ? {
          id: openingMessage.id,
          body: openingMessage.body,
          kind: openingMessage.kind,
        }
      : null,
  });
}
