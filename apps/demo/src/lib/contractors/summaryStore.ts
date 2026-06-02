import { getSupabaseAdminConfig } from "../supabaseAdmin";
import type { ContractorSummary, ReviewForSummary } from "./summarize";

/**
 * Persistence for M2.3 contractor_summaries. Read existing summary,
 * upsert a fresh one, fetch the review corpus, and fetch the host
 * contractor row that lazy-generation needs.
 *
 * Service-role only — the contractor_summaries table has RLS locked.
 */

export type ContractorSummaryRow = ContractorSummary & {
  contractor_id: string;
  generated_at: string;
  updated_at: string;
};

function adminHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

/** Return null if not yet generated. */
export async function getContractorSummary(
  contractorId: string,
): Promise<ContractorSummaryRow | null> {
  const { url, serviceRoleKey } = getSupabaseAdminConfig();
  const res = await fetch(
    `${url}/rest/v1/contractor_summaries?contractor_id=eq.${contractorId}&select=*&limit=1`,
    {
      headers: adminHeaders(serviceRoleKey),
      cache: "no-store",
    },
  );
  if (!res.ok) {
    throw new Error(`contractor_summaries read failed: ${res.status}`);
  }
  const rows = (await res.json()) as ContractorSummaryRow[];
  return rows[0] ?? null;
}

export async function upsertContractorSummary(args: {
  contractorId: string;
  summary: ContractorSummary;
}): Promise<void> {
  const { url, serviceRoleKey } = getSupabaseAdminConfig();
  const body = [
    {
      contractor_id: args.contractorId,
      summary: args.summary.summary,
      strengths_md: args.summary.strengths_md,
      weaknesses_md: args.summary.weaknesses_md,
      sample_quotes: args.summary.sample_quotes,
      reviews_summarized: args.summary.reviews_summarized,
      model: args.summary.model,
      generated_at: new Date().toISOString(),
    },
  ];
  const res = await fetch(
    `${url}/rest/v1/contractor_summaries?on_conflict=contractor_id`,
    {
      method: "POST",
      headers: {
        ...adminHeaders(serviceRoleKey),
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    throw new Error(
      `contractor_summaries upsert failed: ${res.status} ${await res.text()}`,
    );
  }
}

/** Fetch the contractor row + its review corpus. Returns null if missing. */
export async function getContractorWithReviews(
  contractorId: string,
): Promise<{
  contractor: { id: string; name: string };
  reviews: ReviewForSummary[];
} | null> {
  const { url, serviceRoleKey } = getSupabaseAdminConfig();

  const cRes = await fetch(
    `${url}/rest/v1/contractors?id=eq.${contractorId}&select=id,name&limit=1`,
    { headers: adminHeaders(serviceRoleKey), cache: "no-store" },
  );
  if (!cRes.ok) {
    throw new Error(`contractors read failed: ${cRes.status}`);
  }
  const contractors = (await cRes.json()) as Array<{
    id: string;
    name: string;
  }>;
  if (!contractors[0]) return null;

  const rRes = await fetch(
    `${url}/rest/v1/contractor_reviews?contractor_id=eq.${contractorId}` +
      `&select=rating,body,reviewed_at,reviewer_name` +
      `&order=reviewed_at.desc.nullslast&limit=50`,
    { headers: adminHeaders(serviceRoleKey), cache: "no-store" },
  );
  if (!rRes.ok) {
    throw new Error(`contractor_reviews read failed: ${rRes.status}`);
  }
  const reviews = (await rRes.json()) as ReviewForSummary[];

  return { contractor: contractors[0], reviews };
}

/**
 * Lazy-cache policy: regenerate if missing OR >30 days old OR the
 * review corpus has grown by 5+ since the row was generated.
 */
export function isSummaryStale(args: {
  existing: ContractorSummaryRow | null;
  currentReviewCount: number;
}): boolean {
  if (!args.existing) return true;
  const ageMs = Date.now() - new Date(args.existing.generated_at).getTime();
  if (ageMs > 30 * 86_400_000) return true;
  if (args.currentReviewCount - args.existing.reviews_summarized >= 5) {
    return true;
  }
  return false;
}
