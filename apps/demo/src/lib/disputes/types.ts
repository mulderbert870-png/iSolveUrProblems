/**
 * M3.9 — Dispute mediator types.
 *
 * v1 surface = async-text thread in the drawer. Phone-call intake
 * (M3.1-dependent) lands later via the same backend.
 */

export type DisputeStatus =
  | "open"
  | "awaiting_user"
  | "resolved"
  | "escalated"
  | "closed";

export type DisputeParty = "user" | "contractor";

export type DisputeResolutionKind =
  | "refund_full"
  | "refund_partial"
  | "redo_work"
  | "no_action"
  | "human_escalation";

export type DisputeRow = {
  id: string;
  user_id: string;
  contract_id: string | null;
  contractor_id: string | null;
  party: DisputeParty;
  complaint: string;
  disputed_amount_cents: number | null;
  status: DisputeStatus;
  resolution_kind: DisputeResolutionKind | null;
  resolution_summary: string | null;
  mediator_turn_count: number;
  intake_call_id: string | null;
  context: Record<string, unknown>;
  created_at: string;
  resolved_at: string | null;
  updated_at: string;
};

export type DisputeMessageSender =
  | "user"
  | "contractor"
  | "mediator"
  | "system";

export type DisputeMessageKind =
  | "message"
  | "remedy_proposal"
  | "escalation_notice"
  | "resolution_confirmation";

export type DisputeMessageRow = {
  id: string;
  dispute_id: string;
  sender: DisputeMessageSender;
  body: string;
  kind: DisputeMessageKind;
  context: Record<string, unknown>;
  created_at: string;
};

export type CreateDisputeInput = {
  user_id: string;
  contract_id?: string | null;
  contractor_id?: string | null;
  complaint: string;
  disputed_amount_cents?: number | null;
  context?: Record<string, unknown>;
};

export type AppendMessageInput = {
  dispute_id: string;
  sender: DisputeMessageSender;
  body: string;
  kind?: DisputeMessageKind;
  context?: Record<string, unknown>;
};
