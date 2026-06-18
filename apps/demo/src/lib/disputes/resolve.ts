import { OPENAI_API_KEY } from "../../../app/api/secrets";
import type {
  DisputeMessageRow,
  DisputeResolutionKind,
  DisputeRow,
} from "./types";

/**
 * M3.9 — Mediator brain.
 *
 * Given a dispute + its thread, returns the next mediator action:
 *   - propose: a remedy_proposal message body + suggested kind
 *   - ask: a clarifying question (kind = "message")
 *   - escalate: signal that human escalation must fire
 *
 * Q3.9a escalation criteria — checked deterministically BEFORE the LLM
 * call so we never burn a turn on something that's already going to
 * humans anyway:
 *   1. mediator_turn_count >= 3 (3-strike rule)
 *   2. disputed_amount_cents > 50_000 ($500)
 *   3. Latest user message contains "I want a person" / "human" / "speak to someone"
 *
 * When the LLM is unavailable we fall back to a deterministic rules-based
 * remedy proposal so the test drive still demonstrates the loop.
 */

const MAX_MEDIATOR_TURNS = 3;
const ESCALATION_AMOUNT_THRESHOLD_CENTS = 50_000;
const HUMAN_PHRASES = [
  /\bi\s+want\s+a\s+(person|human|real\s+person|manager)\b/i,
  /\bspeak\s+to\s+(someone|a\s+human|a\s+person|a\s+manager)\b/i,
  /\bget\s+me\s+(a\s+)?(human|manager|person)\b/i,
  /\bescalate\s+(this|to\s+a\s+human)\b/i,
];

const MEDIATOR_MODEL =
  process.env.DISPUTE_MEDIATOR_MODEL || "gpt-4o-mini";

export type MediatorDecision =
  | {
      kind: "reply";
      body: string;
      message_kind: "message" | "remedy_proposal";
      proposed_resolution?: {
        resolution_kind: DisputeResolutionKind;
        summary: string;
      };
    }
  | {
      kind: "escalate";
      reason: string;
      body: string;
    };

export type MediatorContext = {
  dispute: DisputeRow;
  thread: DisputeMessageRow[];
  /** Optional contract details — feeds the brain the dollar amount + scope. */
  contract?: {
    contractor_name: string;
    scope: string;
    amount_cents: number;
    currency: string;
  } | null;
  /** Latest user message (most recent sender='user' entry). */
  latestUserMessage: string;
};

/** Deterministic Q3.9a escalation check. */
function shouldEscalate(ctx: MediatorContext): {
  yes: boolean;
  reason: string;
} {
  if (ctx.dispute.mediator_turn_count >= MAX_MEDIATOR_TURNS) {
    return {
      yes: true,
      reason: `3-strike rule: ${ctx.dispute.mediator_turn_count} mediator turns without resolution`,
    };
  }
  if (
    ctx.dispute.disputed_amount_cents != null &&
    ctx.dispute.disputed_amount_cents > ESCALATION_AMOUNT_THRESHOLD_CENTS
  ) {
    return {
      yes: true,
      reason: `disputed amount $${(
        ctx.dispute.disputed_amount_cents / 100
      ).toFixed(2)} exceeds the $500 threshold — requires human review`,
    };
  }
  const latest = ctx.latestUserMessage.toLowerCase();
  for (const re of HUMAN_PHRASES) {
    if (re.test(latest)) {
      return {
        yes: true,
        reason: `user asked for a human ("${ctx.latestUserMessage.slice(0, 80)}")`,
      };
    }
  }
  return { yes: false, reason: "" };
}

/**
 * Rules-based fallback when no LLM key is available. Suggests a partial
 * refund proportional to the disputed amount, plus an offer to redo.
 */
function rulesBasedRemedyProposal(ctx: MediatorContext): MediatorDecision {
  if (ctx.contract) {
    const proposedCents = Math.min(
      ctx.dispute.disputed_amount_cents ??
        Math.floor(ctx.contract.amount_cents * 0.2),
      Math.floor(ctx.contract.amount_cents * 0.5),
    );
    const dollars = (proposedCents / 100).toFixed(2);
    return {
      kind: "reply",
      message_kind: "remedy_proposal",
      body:
        `I hear you. Based on what you've shared, here's what I can propose: ` +
        `a partial refund of $${dollars} from ${ctx.contract.contractor_name}, ` +
        `OR they come back to redo the work at no additional charge. ` +
        `Which would you prefer? If neither feels right, just tell me what would.`,
      proposed_resolution: {
        resolution_kind: "refund_partial",
        summary: `Partial refund $${dollars} OR redo work — offered for ${ctx.contract.contractor_name}`,
      },
    };
  }
  return {
    kind: "reply",
    message_kind: "message",
    body:
      `Thanks for the details. Can you tell me what outcome would feel fair to you — ` +
      `a partial refund, having the contractor return to redo the work, or something else?`,
  };
}

type LlmResponse = {
  action: "reply" | "remedy_proposal";
  body: string;
  resolution_kind?: DisputeResolutionKind;
  resolution_summary?: string;
};

function buildLlmMessages(ctx: MediatorContext): Array<{
  role: "system" | "user";
  content: string;
}> {
  const threadText = ctx.thread
    .slice(-10)
    .map(
      (m) =>
        `${m.sender.toUpperCase()}${m.kind !== "message" ? ` (${m.kind})` : ""}: ${m.body}`,
    )
    .join("\n");
  const contractLine = ctx.contract
    ? `Contract context: ${ctx.contract.contractor_name} agreed to do "${
        ctx.contract.scope
      }" for $${(ctx.contract.amount_cents / 100).toFixed(2)} ${
        ctx.contract.currency
      }.`
    : `No contract on file for this dispute.`;
  const turnLine = `This is mediator turn ${
    ctx.dispute.mediator_turn_count + 1
  } of ${MAX_MEDIATOR_TURNS}. After turn ${MAX_MEDIATOR_TURNS} the dispute escalates to a human.`;
  return [
    {
      role: "system",
      content: [
        `You are "6", a calm and fair-minded dispute mediator for a home-services platform.`,
        `Your job: help the homeowner and contractor reach a fair resolution.`,
        ``,
        `Rules:`,
        ` - Keep replies SHORT (2-4 sentences max).`,
        ` - Acknowledge what the user said. Don't repeat their complaint back at them.`,
        ` - If you have enough information, propose a CONCRETE remedy: partial refund (in dollars), full refund, redo work, or no action with a clear reason.`,
        ` - If you need more info, ask ONE specific question.`,
        ` - Stay neutral. Don't take sides.`,
        ` - Don't promise anything you can't deliver. The actual refund/redo executes through the platform after both parties accept.`,
        ``,
        `Output JSON exactly:`,
        `{`,
        `  "action": "reply" | "remedy_proposal",`,
        `  "body": "<your message to the user>",`,
        `  "resolution_kind": "refund_full" | "refund_partial" | "redo_work" | "no_action",  // only when action == remedy_proposal`,
        `  "resolution_summary": "<one-line summary of the proposal>"  // only when action == remedy_proposal`,
        `}`,
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Dispute opened by homeowner. Complaint: "${ctx.dispute.complaint}"`,
        ctx.dispute.disputed_amount_cents != null
          ? `Disputed amount: $${(ctx.dispute.disputed_amount_cents / 100).toFixed(2)}`
          : `Disputed amount: not specified`,
        contractLine,
        turnLine,
        ``,
        `Conversation so far:`,
        threadText || "(no messages yet — this is the opening of the thread)",
        ``,
        `Latest user message: "${ctx.latestUserMessage}"`,
        ``,
        `What's your next move?`,
      ].join("\n"),
    },
  ];
}

async function callLlm(
  ctx: MediatorContext,
): Promise<LlmResponse | { error: string }> {
  if (!OPENAI_API_KEY) {
    return { error: "OPENAI_API_KEY not set" };
  }
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MEDIATOR_MODEL,
        response_format: { type: "json_object" },
        temperature: 0.4,
        messages: buildLlmMessages(ctx),
      }),
    });
    if (!res.ok) {
      return { error: `openai ${res.status}: ${(await res.text()).slice(0, 200)}` };
    }
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw) as LlmResponse;
    if (
      typeof parsed?.body !== "string" ||
      (parsed.action !== "reply" && parsed.action !== "remedy_proposal")
    ) {
      return { error: "LLM returned malformed JSON" };
    }
    return parsed;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "llm fetch threw" };
  }
}

/**
 * Top-level: decide what the mediator does next.
 */
export async function decideMediatorAction(
  ctx: MediatorContext,
): Promise<MediatorDecision> {
  // 1. Hard escalation rules first (Q3.9a).
  const esc = shouldEscalate(ctx);
  if (esc.yes) {
    return {
      kind: "escalate",
      reason: esc.reason,
      body:
        `This needs a human's eyes — I've flagged it for our admin team and they'll reach out shortly. ` +
        `Reason: ${esc.reason}.`,
    };
  }

  // 2. LLM mediation.
  const llm = await callLlm(ctx);
  if ("error" in llm) {
    // Fallback to rules-based remedy.
    console.warn("[disputes/mediator] LLM unavailable:", llm.error);
    return rulesBasedRemedyProposal(ctx);
  }

  if (
    llm.action === "remedy_proposal" &&
    llm.resolution_kind &&
    llm.resolution_summary
  ) {
    return {
      kind: "reply",
      message_kind: "remedy_proposal",
      body: llm.body,
      proposed_resolution: {
        resolution_kind: llm.resolution_kind,
        summary: llm.resolution_summary,
      },
    };
  }

  return {
    kind: "reply",
    message_kind: "message",
    body: llm.body,
  };
}
