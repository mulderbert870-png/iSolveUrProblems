import {
  searchContractors,
  getContractorSummary,
  getContractorWithReviews,
  isSummaryStale,
  summarizeReviews,
  upsertContractorSummary,
  recommendContractors,
} from "../contractors";
import { getSupabaseAdminConfig } from "../supabaseAdmin";
import { classifyIntent } from "./classify";
import { DEFAULT_CENTER } from "./slots";
import {
  wrapContractorsResult,
  wrapFallback,
  wrapPickResult,
  wrapRecommendationsResult,
  wrapSummaryResult,
} from "./contextInjector";
import { executeBook } from "./bookHandler";
import type {
  ContractorCard,
  RecommendationCard,
  SummaryPayload,
  SurfaceVariant,
} from "../assistantSurface";
import type {
  ContractorRef,
  IntentClassification,
  IntentSlots,
} from "./types";

/**
 * M3.0e — Intent orchestrator.
 *
 * Pipeline:
 *   text → classifyIntent() → run matching backend → build SurfaceVariant
 *        + contextMessage → return both to caller (the client uses
 *        them to update the drawer + send via session.message()).
 *
 * Surface snapshot:
 *   The client passes the IDs of contractors currently displayed in the
 *   drawer (in display order) so we can resolve "the first one" /
 *   "Acme" / "#2" references on the server.
 *
 * Failure modes:
 *   - No intent match → returns { kind: "none" }
 *   - Intent matched but slots insufficient → returns a "fallback"
 *     context message asking the user to clarify, no surface update
 *   - Intent matched + backend returned something → full action
 */

export type SurfaceSnapshot = {
  kind: "contractors" | "summary" | "picks" | "pickResult" | null;
  /** Ordered as displayed in the drawer. Empty for non-list variants. */
  contractorIds: string[];
};

export type OrchestratorInput = {
  text: string;
  session_id: string;
  user_id: string | null;
  /** Optional snapshot of what the drawer currently shows. */
  currentSurface?: SurfaceSnapshot;
};

export type OrchestratorOutput =
  | { kind: "none"; reason: string }
  | {
      kind: "action";
      classification: IntentClassification;
      variant?: SurfaceVariant;
      contextMessage?: string;
      debug?: Record<string, unknown>;
    };

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Resolve a contractor ref (ordinal / name) to a contractor row.
 * Ordinals come from the drawer snapshot the client passed in. Names
 * trigger a database lookup.
 */
async function resolveContractorRef(args: {
  ref: ContractorRef;
  snapshot?: SurfaceSnapshot;
}): Promise<{ id: string; name: string } | null> {
  if (args.ref.type === "ordinal") {
    const ids = args.snapshot?.contractorIds ?? [];
    const idx = args.ref.position - 1;
    if (idx < 0 || idx >= ids.length) return null;
    const id = ids[idx];
    // Pull just the row to get the canonical name back.
    const row = await fetchContractorById(id);
    return row;
  }
  // Name resolution: ILIKE on contractors.name; take highest-rated match.
  return findContractorByName(args.ref.name);
}

async function fetchContractorById(
  id: string,
): Promise<{ id: string; name: string } | null> {
  let url: string;
  let serviceRoleKey: string;
  try {
    ({ url, serviceRoleKey } = getSupabaseAdminConfig());
  } catch {
    return null;
  }
  const res = await fetch(
    `${url}/rest/v1/contractors?id=eq.${encodeURIComponent(
      id,
    )}&select=id,name&limit=1`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      cache: "no-store",
    },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ id: string; name: string }>;
  return rows[0] ?? null;
}

async function findContractorByName(
  name: string,
): Promise<{ id: string; name: string } | null> {
  let url: string;
  let serviceRoleKey: string;
  try {
    ({ url, serviceRoleKey } = getSupabaseAdminConfig());
  } catch {
    return null;
  }
  const qs = new URLSearchParams();
  qs.set("select", "id,name");
  qs.set("name", `ilike.%${name}%`);
  qs.set("order", "rating_avg.desc.nullslast");
  qs.set("limit", "1");
  const res = await fetch(`${url}/rest/v1/contractors?${qs.toString()}`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ id: string; name: string }>;
  return rows[0] ?? null;
}

function contractorRowToCard(c: {
  id: string;
  name: string;
  rating_avg: number | null;
  rating_count: number | null;
  distance_km?: number;
  price_tier: number | null;
  locally_owned: boolean | null;
  same_day_flag: boolean | null;
  licensed_flag: boolean | null;
  phone: string | null;
  website: string | null;
  score?: number;
}): ContractorCard {
  return {
    id: c.id,
    name: c.name,
    rating_avg: c.rating_avg,
    rating_count: c.rating_count,
    distance_km: c.distance_km ?? 0,
    price_tier: c.price_tier,
    locally_owned: c.locally_owned,
    same_day_flag: c.same_day_flag,
    licensed_flag: c.licensed_flag,
    phone: c.phone,
    website: c.website,
    score: c.score,
  };
}

// ─── Per-intent handlers ────────────────────────────────────────────

async function handleFindContractor(args: {
  slots: IntentSlots;
}): Promise<{ variant: SurfaceVariant; contextMessage: string }> {
  const category = args.slots.category ?? "general";
  const near = args.slots.location ?? DEFAULT_CENTER;
  const result = await searchContractors({
    category,
    near,
    radius_km: 25,
    min_rating: args.slots.filters?.min_rating,
    max_price_tier: args.slots.filters?.max_price_tier,
    locally_owned: args.slots.filters?.locally_owned,
    same_day: args.slots.filters?.same_day,
    limit: 10,
  });
  const hits: ContractorCard[] = result.hits.map(contractorRowToCard);
  return {
    variant: {
      kind: "contractors",
      hits,
      total_considered: result.total_considered,
    },
    contextMessage: wrapContractorsResult({
      category,
      location_text: args.slots.location_text,
      hits,
    }),
  };
}

async function handleTellMeMore(args: {
  slots: IntentSlots;
  snapshot?: SurfaceSnapshot;
}): Promise<
  | { variant: SurfaceVariant; contextMessage: string }
  | { contextMessage: string }
> {
  if (!args.slots.contractor_ref) {
    return {
      contextMessage: wrapFallback(
        "user wanted details but didn't say which contractor",
      ),
    };
  }
  const resolved = await resolveContractorRef({
    ref: args.slots.contractor_ref,
    snapshot: args.snapshot,
  });
  if (!resolved) {
    return {
      contextMessage: wrapFallback(
        `couldn't identify the contractor (${
          args.slots.contractor_ref.type === "name"
            ? "name: " + args.slots.contractor_ref.name
            : "no list on screen"
        })`,
      ),
    };
  }

  // Pull the cached summary OR lazy-generate (matches M2.3's behavior).
  const existing = await getContractorSummary(resolved.id).catch(() => null);
  const data = await getContractorWithReviews(resolved.id).catch(() => null);
  if (!data) {
    return {
      contextMessage: wrapFallback(`no reviews on file for ${resolved.name}`),
    };
  }
  const stale = isSummaryStale({
    existing,
    currentReviewCount: data.reviews.length,
  });
  let payload: SummaryPayload | null = null;
  let cached = false;
  if (existing && !stale) {
    payload = {
      contractor_id: resolved.id,
      contractor_name: resolved.name,
      summary: existing.summary,
      strengths_md: existing.strengths_md,
      weaknesses_md: existing.weaknesses_md,
      sample_quotes: existing.sample_quotes,
    };
    cached = true;
  } else {
    const fresh = await summarizeReviews({
      contractorName: resolved.name,
      reviews: data.reviews,
    });
    if (!fresh.ok) {
      return {
        contextMessage: wrapFallback(
          `couldn't summarize ${resolved.name} (${fresh.reason})`,
        ),
      };
    }
    await upsertContractorSummary({
      contractorId: resolved.id,
      summary: fresh.summary,
    }).catch(() => undefined);
    payload = {
      contractor_id: resolved.id,
      contractor_name: resolved.name,
      summary: fresh.summary.summary,
      strengths_md: fresh.summary.strengths_md,
      weaknesses_md: fresh.summary.weaknesses_md,
      sample_quotes: fresh.summary.sample_quotes,
    };
  }
  return {
    variant: { kind: "summary", payload, cached },
    contextMessage: wrapSummaryResult({
      contractor_name: resolved.name,
      payload,
    }),
  };
}

async function handleRecommend(args: {
  slots: IntentSlots;
  user_id: string | null;
  snapshot?: SurfaceSnapshot;
}): Promise<
  | { variant: SurfaceVariant; contextMessage: string }
  | { contextMessage: string }
> {
  // If we have a current contractor list, use its category from the snapshot
  // (best-effort) — otherwise fall back to "general" + default center.
  const category = args.slots.category ?? "general";
  const near = args.slots.location ?? DEFAULT_CENTER;
  const result = await recommendContractors({
    userId: args.user_id,
    searchInput: {
      category,
      near,
      radius_km: 25,
      min_rating: 4.5,
    },
  });
  if (result.picks.length === 0) {
    return {
      contextMessage: wrapFallback(
        "no recommendations could be produced (engine returned empty)",
      ),
    };
  }
  const picks: RecommendationCard[] = result.picks.map((p) => ({
    id: p.contractor_id,
    name: p.name,
    rating_avg: p.rating_avg,
    rating_count: p.rating_count,
    distance_km: p.distance_km,
    price_tier: p.price_tier,
    locally_owned: p.locally_owned,
    same_day_flag: p.same_day_flag,
    licensed_flag: p.licensed_flag,
    phone: p.phone,
    website: p.website,
    score: p.score,
    reason: p.reason,
  }));
  return {
    variant: {
      kind: "picks",
      picks,
      preference_facts: result.preference_facts,
    },
    contextMessage: wrapRecommendationsResult({
      picks,
      preference_facts: result.preference_facts,
    }),
  };
}

async function handleBook(args: {
  slots: IntentSlots;
  snapshot?: SurfaceSnapshot;
  user_id: string | null;
}): Promise<
  | { variant: SurfaceVariant; contextMessage: string }
  | { contextMessage: string }
> {
  if (!args.slots.contractor_ref) {
    return {
      contextMessage: wrapFallback(
        "user wanted to book but didn't say which contractor",
      ),
    };
  }
  const resolved = await resolveContractorRef({
    ref: args.slots.contractor_ref,
    snapshot: args.snapshot,
  });
  if (!resolved) {
    return {
      contextMessage: wrapFallback(
        "couldn't identify the contractor to book",
      ),
    };
  }

  const { payload } = await executeBook({
    winner_id: resolved.id,
    winner_name: resolved.name,
    candidate_ids: args.snapshot?.contractorIds ?? [],
    user_id: args.user_id,
  });

  return {
    variant: { kind: "pickResult", payload },
    contextMessage: wrapPickResult({
      winner_name: resolved.name,
      loser_count: payload.losers.length,
      delivered_count: payload.total_sent,
      failed_count: payload.total_failed,
    }),
  };
}

// ─── Top-level orchestrator ────────────────────────────────────────

export async function orchestrate(
  input: OrchestratorInput,
): Promise<OrchestratorOutput> {
  const classified = classifyIntent(input.text);
  if (!classified.matched) {
    return { kind: "none", reason: classified.reason };
  }
  const { classification } = classified;

  // Only "high" confidence triggers actions. "medium" still gets
  // surfaced for diagnostic logging but doesn't fire backend calls
  // (avoids spurious surface updates on partial matches).
  if (classification.confidence !== "high") {
    return {
      kind: "action",
      classification,
      contextMessage: wrapFallback(
        `intent ${classification.kind} matched but slots insufficient`,
      ),
      debug: {
        confidence: classification.confidence,
        matched_rule: classification.matched_rule,
      },
    };
  }

  switch (classification.kind) {
    case "find_contractor": {
      const r = await handleFindContractor({ slots: classification.slots });
      return {
        kind: "action",
        classification,
        variant: r.variant,
        contextMessage: r.contextMessage,
      };
    }
    case "tell_me_more": {
      const r = await handleTellMeMore({
        slots: classification.slots,
        snapshot: input.currentSurface,
      });
      return {
        kind: "action",
        classification,
        variant: "variant" in r ? r.variant : undefined,
        contextMessage: r.contextMessage,
      };
    }
    case "recommend": {
      const r = await handleRecommend({
        slots: classification.slots,
        user_id: input.user_id,
        snapshot: input.currentSurface,
      });
      return {
        kind: "action",
        classification,
        variant: "variant" in r ? r.variant : undefined,
        contextMessage: r.contextMessage,
      };
    }
    case "book": {
      const r = await handleBook({
        slots: classification.slots,
        snapshot: input.currentSurface,
        user_id: input.user_id,
      });
      return {
        kind: "action",
        classification,
        variant: "variant" in r ? r.variant : undefined,
        contextMessage: r.contextMessage,
      };
    }
  }
}
