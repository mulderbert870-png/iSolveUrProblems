import { getSupabaseAdminConfig } from "../supabaseAdmin";
import type {
  AppendMessageInput,
  CreateDisputeInput,
  DisputeMessageRow,
  DisputeResolutionKind,
  DisputeRow,
  DisputeStatus,
} from "./types";

/**
 * M3.9 — Dispute persistence.
 *
 * Service-role writes — the mediator brain runs server-side, so it
 * needs to insert messages on behalf of "6" (sender = "mediator"). RLS
 * still protects user-side reads.
 */

function adminHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

export async function createDispute(
  input: CreateDisputeInput,
): Promise<DisputeRow | null> {
  const { url, serviceRoleKey } = getSupabaseAdminConfig();
  const row = {
    user_id: input.user_id,
    contract_id: input.contract_id ?? null,
    contractor_id: input.contractor_id ?? null,
    complaint: input.complaint,
    disputed_amount_cents: input.disputed_amount_cents ?? null,
    context: input.context ?? {},
  };
  const res = await fetch(`${url}/rest/v1/disputes`, {
    method: "POST",
    headers: {
      ...adminHeaders(serviceRoleKey),
      Prefer: "return=representation",
    },
    body: JSON.stringify([row]),
  });
  if (!res.ok) {
    console.error("disputes insert failed:", res.status, await res.text());
    return null;
  }
  const rows = (await res.json()) as DisputeRow[];
  return rows[0] ?? null;
}

export async function getDisputeById(
  id: string,
): Promise<DisputeRow | null> {
  const { url, serviceRoleKey } = getSupabaseAdminConfig();
  const res = await fetch(
    `${url}/rest/v1/disputes?id=eq.${encodeURIComponent(id)}&limit=1`,
    { headers: adminHeaders(serviceRoleKey), cache: "no-store" },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as DisputeRow[];
  return rows[0] ?? null;
}

export async function listDisputeMessages(
  disputeId: string,
): Promise<DisputeMessageRow[]> {
  const { url, serviceRoleKey } = getSupabaseAdminConfig();
  const res = await fetch(
    `${url}/rest/v1/dispute_messages?dispute_id=eq.${encodeURIComponent(
      disputeId,
    )}&order=created_at.asc`,
    { headers: adminHeaders(serviceRoleKey), cache: "no-store" },
  );
  if (!res.ok) return [];
  return (await res.json()) as DisputeMessageRow[];
}

export async function appendDisputeMessage(
  input: AppendMessageInput,
): Promise<DisputeMessageRow | null> {
  const { url, serviceRoleKey } = getSupabaseAdminConfig();
  const row = {
    dispute_id: input.dispute_id,
    sender: input.sender,
    body: input.body,
    kind: input.kind ?? "message",
    context: input.context ?? {},
  };
  const res = await fetch(`${url}/rest/v1/dispute_messages`, {
    method: "POST",
    headers: {
      ...adminHeaders(serviceRoleKey),
      Prefer: "return=representation",
    },
    body: JSON.stringify([row]),
  });
  if (!res.ok) {
    console.error(
      "dispute_messages insert failed:",
      res.status,
      await res.text(),
    );
    return null;
  }
  const rows = (await res.json()) as DisputeMessageRow[];
  return rows[0] ?? null;
}

export async function patchDispute(
  id: string,
  patch: Partial<
    Pick<
      DisputeRow,
      | "status"
      | "resolution_kind"
      | "resolution_summary"
      | "mediator_turn_count"
      | "resolved_at"
      | "context"
    >
  >,
): Promise<DisputeRow | null> {
  const { url, serviceRoleKey } = getSupabaseAdminConfig();
  const res = await fetch(
    `${url}/rest/v1/disputes?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: {
        ...adminHeaders(serviceRoleKey),
        Prefer: "return=representation",
      },
      body: JSON.stringify(patch),
    },
  );
  if (!res.ok) {
    console.error("disputes patch failed:", res.status, await res.text());
    return null;
  }
  const rows = (await res.json()) as DisputeRow[];
  return rows[0] ?? null;
}

export async function bumpMediatorTurnCount(
  id: string,
  next: number,
): Promise<void> {
  await patchDispute(id, { mediator_turn_count: next });
}

export async function setDisputeStatus(
  id: string,
  status: DisputeStatus,
  resolution?: {
    kind: DisputeResolutionKind;
    summary: string;
  },
): Promise<DisputeRow | null> {
  return patchDispute(id, {
    status,
    ...(resolution
      ? {
          resolution_kind: resolution.kind,
          resolution_summary: resolution.summary,
          resolved_at: new Date().toISOString(),
        }
      : {}),
  });
}

export async function listUserDisputes(args: {
  user_id: string;
  limit?: number;
}): Promise<DisputeRow[]> {
  const { url, serviceRoleKey } = getSupabaseAdminConfig();
  const qs = new URLSearchParams();
  qs.set("user_id", `eq.${args.user_id}`);
  qs.set("order", "created_at.desc");
  qs.set("limit", String(args.limit ?? 20));
  const res = await fetch(`${url}/rest/v1/disputes?${qs.toString()}`, {
    headers: adminHeaders(serviceRoleKey),
    cache: "no-store",
  });
  if (!res.ok) return [];
  return (await res.json()) as DisputeRow[];
}
