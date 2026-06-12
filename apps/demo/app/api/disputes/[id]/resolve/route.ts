import { NextResponse, type NextRequest } from "next/server";
import { assertAllowedOrigin } from "../../../../../src/lib/apiRouteSecurity";
import { checkRateLimit } from "../../../../../src/lib/rateLimit";
import { getUserId } from "../../../../../src/lib/auth/getUser";
import {
  appendDisputeMessage,
  getDisputeById,
  notifyAdminEscalation,
  setDisputeStatus,
  type DisputeResolutionKind,
} from "../../../../../src/lib/disputes";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * POST /api/disputes/[id]/resolve  (M3.9)
 *
 * User-driven outcome of a dispute thread. Two paths:
 *   - { action: "accept", kind, summary }     → mark resolved
 *   - { action: "escalate", reason? }         → hand to admin queue
 *
 * The mediator brain proposes remedies via remedy_proposal messages;
 * the user clicks "Accept" / "Get a human" in the panel.
 */

const VALID_KINDS = new Set<DisputeResolutionKind>([
  "refund_full",
  "refund_partial",
  "redo_work",
  "no_action",
  "human_escalation",
]);

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
  if (dispute.status === "resolved" || dispute.status === "escalated") {
    return bad(`thread already ${dispute.status}`, 409);
  }

  let body: {
    action?: unknown;
    kind?: unknown;
    summary?: unknown;
    reason?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return bad("invalid JSON");
  }

  if (body.action === "accept") {
    if (
      typeof body.kind !== "string" ||
      !VALID_KINDS.has(body.kind as DisputeResolutionKind)
    ) {
      return bad("kind is required and must be a valid resolution_kind");
    }
    const summary =
      typeof body.summary === "string" && body.summary.trim() !== ""
        ? body.summary.trim()
        : "User accepted the proposed remedy";
    await appendDisputeMessage({
      dispute_id: dispute.id,
      sender: "user",
      body: `Accepted: ${summary}`,
      kind: "resolution_confirmation",
    });
    await setDisputeStatus(dispute.id, "resolved", {
      kind: body.kind as DisputeResolutionKind,
      summary,
    });
    return NextResponse.json({ status: "resolved" });
  }

  if (body.action === "escalate") {
    const reason =
      typeof body.reason === "string" && body.reason.trim() !== ""
        ? body.reason.trim()
        : "user requested human escalation";
    await appendDisputeMessage({
      dispute_id: dispute.id,
      sender: "user",
      body: `User requested human review: ${reason}`,
      kind: "escalation_notice",
    });
    await setDisputeStatus(dispute.id, "escalated", {
      kind: "human_escalation",
      summary: reason,
    });
    const refreshed = (await getDisputeById(dispute.id)) ?? dispute;
    await notifyAdminEscalation({
      dispute: refreshed,
      reason,
      app_origin: new URL(request.url).origin,
    });
    return NextResponse.json({ status: "escalated" });
  }

  return bad("action must be 'accept' or 'escalate'");
}
