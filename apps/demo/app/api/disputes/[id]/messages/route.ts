import { NextResponse, type NextRequest } from "next/server";
import { assertAllowedOrigin } from "../../../../../src/lib/apiRouteSecurity";
import { checkRateLimit } from "../../../../../src/lib/rateLimit";
import { getUserId } from "../../../../../src/lib/auth/getUser";
import {
  appendDisputeMessage,
  decideMediatorAction,
  getDisputeById,
  listDisputeMessages,
  notifyAdminEscalation,
  patchDispute,
  setDisputeStatus,
} from "../../../../../src/lib/disputes";
import { getContractById } from "../../../../../src/lib/payments";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/disputes/[id]/messages  (M3.9)
 *
 * Append a user message to the dispute thread, run the mediator brain,
 * and return its reply.
 *
 * Body:
 *   { body: string }   // user's message
 *
 * Returns:
 *   {
 *     user_message: { id, body },
 *     mediator_message: { id, body, kind },
 *     status: DisputeStatus,
 *     escalated: boolean
 *   }
 */

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
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

  const { id } = await params;
  const dispute = await getDisputeById(id);
  if (!dispute) return bad("dispute not found", 404);
  if (dispute.user_id !== userId) return bad("forbidden", 403);
  if (dispute.status === "escalated" || dispute.status === "resolved") {
    return bad(`thread is ${dispute.status}; cannot append`, 409);
  }

  let body: { body?: unknown };
  try {
    body = await request.json();
  } catch {
    return bad("invalid JSON");
  }
  if (typeof body.body !== "string" || body.body.trim() === "") {
    return bad("body is required (non-empty string)");
  }
  const text = body.body.trim();

  const userMessage = await appendDisputeMessage({
    dispute_id: dispute.id,
    sender: "user",
    body: text,
    kind: "message",
  });
  if (!userMessage) return bad("failed to append message", 500);

  const thread = await listDisputeMessages(dispute.id);

  // Pull contract context if linked. Best-effort.
  const contract = dispute.contract_id
    ? await getContractById(dispute.contract_id, userId).catch(() => null)
    : null;
  const contractCtx = contract
    ? {
        contractor_name:
          (contract.context as { contractor_name?: string })?.contractor_name ??
          "the contractor",
        scope: contract.scope ?? contract.category ?? "the agreed work",
        amount_cents: contract.amount_cents,
        currency: contract.currency,
      }
    : null;

  const decision = await decideMediatorAction({
    dispute,
    thread,
    contract: contractCtx,
    latestUserMessage: text,
  });

  if (decision.kind === "escalate") {
    const escMsg = await appendDisputeMessage({
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
    return NextResponse.json({
      user_message: { id: userMessage.id, body: userMessage.body },
      mediator_message: escMsg
        ? { id: escMsg.id, body: escMsg.body, kind: escMsg.kind }
        : null,
      status: "escalated",
      escalated: true,
    });
  }

  const replyMsg = await appendDisputeMessage({
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
    mediator_turn_count: dispute.mediator_turn_count + 1,
  });

  return NextResponse.json({
    user_message: { id: userMessage.id, body: userMessage.body },
    mediator_message: replyMsg
      ? { id: replyMsg.id, body: replyMsg.body, kind: replyMsg.kind }
      : null,
    status: "awaiting_user",
    escalated: false,
  });
}
