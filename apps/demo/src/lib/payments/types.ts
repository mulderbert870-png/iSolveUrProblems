/**
 * Payments types — M2.5.
 *
 * Mirrors the columns in 20260602_payments.sql.
 */

export type ContractStatus =
  | "pending"
  | "paid"
  | "failed"
  | "refunded"
  | "canceled";

export type ContractRow = {
  id: string;
  user_id: string;
  contractor_id: string;
  category: string;
  amount_cents: number;
  platform_fee_cents: number;
  currency: string;
  status: ContractStatus;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_transfer_id: string | null;
  candidate_ids: string[];
  context: Record<string, unknown>;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};
