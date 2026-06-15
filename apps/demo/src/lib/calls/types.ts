/**
 * M3.1 — Phone-call types.
 */

export type CallStatus =
  | "queued"
  | "dialing"
  | "in_progress"
  | "completed"
  | "failed"
  | "no_answer"
  | "busy"
  | "cancelled";

export type CallRow = {
  id: string;
  user_id: string;
  contractor_id: string | null;
  contract_id: string | null;
  twilio_conference_sid: string | null;
  twilio_call_sid_user: string | null;
  twilio_call_sid_contractor: string | null;
  twilio_call_sid_six: string | null;
  to_user_phone: string;
  to_contractor_phone: string;
  from_phone: string;
  status: CallStatus;
  six_speaking: boolean;
  twilio_recording_sid: string | null;
  twilio_recording_url: string | null;
  storage_recording_path: string | null;
  recording_duration_s: number | null;
  context: Record<string, unknown>;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateCallInput = {
  user_id: string;
  contractor_id: string | null;
  contract_id?: string | null;
  to_user_phone: string;
  to_contractor_phone: string;
  from_phone: string;
  context?: Record<string, unknown>;
};

/**
 * Q3.6a — Fixed JSON schema for estimate line items. All amounts in
 * cents to avoid float drift. Quantity stays decimal (e.g. 2.5 hours).
 */
export type EstimateLineItem = {
  description: string;
  quantity: number;
  unit: string;            // "hour", "sq ft", "each", "trip", etc.
  unit_price_cents: number;
  total_cents: number;     // qty * unit_price (computed; persisted for query)
};

export type EstimateStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "declined"
  | "expired";

export type EstimateRow = {
  id: string;
  user_id: string;
  contractor_id: string | null;
  call_id: string | null;
  contract_id: string | null;
  scope_summary: string;
  line_items: EstimateLineItem[];
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  currency: string;
  status: EstimateStatus;
  source: "call" | "manual" | "voice_intake";
  context: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type CreateEstimateInput = {
  user_id: string;
  contractor_id: string | null;
  call_id: string | null;
  scope_summary: string;
  line_items: EstimateLineItem[];
  tax_cents?: number;
  currency?: string;
  context?: Record<string, unknown>;
};
