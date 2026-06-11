import {
  searchContractors,
  getContractorSummary,
  getContractorWithReviews,
  isSummaryStale,
  summarizeReviews,
  upsertContractorSummary,
  recommendContractors,
  deliberate,
  type DeliberateConstraints,
} from "../contractors";
import {
  createAppointment,
  rescheduleAppointment,
  cancelAppointment,
  listUpcomingAppointments,
  type AppointmentRow,
} from "../appointments";
import { getSupabaseAdminConfig } from "../supabaseAdmin";
import { classifyIntent } from "./classify";
import { DEFAULT_CENTER } from "./slots";
import {
  wrapAppointmentCancelled,
  wrapAppointmentRescheduled,
  wrapAppointmentScheduled,
  wrapAppointmentsList,
  wrapContractorsResult,
  wrapDeliberateOpen,
  wrapDeliberateRefine,
  wrapDraftContract,
  wrapFallback,
  wrapPickResult,
  wrapRecommendationsResult,
  wrapSummaryResult,
} from "./contextInjector";
import { executeBook } from "./bookHandler";
import {
  insertContract,
  setContractEsign,
  computePlatformFeeCents,
  getContractorStripeRow,
} from "../payments";
import {
  getEsignProvider,
  getProviderNameFromEnv,
} from "../esign";
import type { AppointmentCard, ContractPayload } from "../assistantSurface";
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
  kind:
    | "contractors"
    | "summary"
    | "picks"
    | "pickResult"
    | "compare"
    | "appointment"
    | "contract"
    | null;
  /** Ordered as displayed in the drawer. Empty for non-list variants. */
  contractorIds: string[];
  /**
   * Carryover state when current surface is the deliberation compare panel.
   * Lets multi-turn refinement accumulate constraints without losing the
   * category or previous filters.
   */
  deliberation?: {
    category: string;
    constraints: DeliberateConstraints;
  };
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

/**
 * If no category is on the user's lips, look it up from whatever's on
 * screen. Used by deliberate_open when the first utterance is "I can't
 * decide" with no prior compare state.
 */
async function inferCategoryFromSnapshot(
  snapshot?: SurfaceSnapshot,
): Promise<string> {
  if (snapshot?.deliberation?.category) return snapshot.deliberation.category;
  if (!snapshot?.contractorIds?.length) return "general";
  const firstId = snapshot.contractorIds[0];
  try {
    const { url, serviceRoleKey } = getSupabaseAdminConfig();
    const res = await fetch(
      `${url}/rest/v1/contractors?id=eq.${encodeURIComponent(
        firstId,
      )}&select=categories&limit=1`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        cache: "no-store",
      },
    );
    if (!res.ok) return "general";
    const rows = (await res.json()) as Array<{ categories: string[] | null }>;
    return rows[0]?.categories?.[0] ?? "general";
  } catch {
    return "general";
  }
}

async function handleDeliberateOpen(args: {
  slots: IntentSlots;
  user_id: string | null;
  snapshot?: SurfaceSnapshot;
}): Promise<
  | { variant: SurfaceVariant; contextMessage: string }
  | { contextMessage: string }
> {
  const category =
    args.slots.category ??
    (await inferCategoryFromSnapshot(args.snapshot));
  const near = args.slots.location ?? DEFAULT_CENTER;
  const result = await deliberate({
    user_id: args.user_id,
    category,
    near,
    constraints: args.snapshot?.deliberation?.constraints ?? {},
    current_pick_ids: args.snapshot?.contractorIds,
  });
  if (!result.ok) {
    return {
      contextMessage: wrapFallback(`deliberate_open: ${result.reason}`),
    };
  }
  return {
    variant: { kind: "compare", payload: result.payload },
    contextMessage: wrapDeliberateOpen({ payload: result.payload }),
  };
}

async function handleDeliberateRefine(args: {
  slots: IntentSlots;
  user_id: string | null;
  snapshot?: SurfaceSnapshot;
}): Promise<
  | { variant: SurfaceVariant; contextMessage: string }
  | { contextMessage: string }
> {
  const prior = args.snapshot?.deliberation;
  const category =
    prior?.category ?? (await inferCategoryFromSnapshot(args.snapshot));
  const priorConstraints = prior?.constraints ?? {};
  const newFilters = args.slots.filters ?? {};

  // Merge filters — new values take precedence.
  const merged: DeliberateConstraints = {
    ...priorConstraints,
    ...(newFilters.locally_owned !== undefined && {
      locally_owned: newFilters.locally_owned,
    }),
    ...(newFilters.same_day !== undefined && {
      same_day: newFilters.same_day,
    }),
    ...(newFilters.min_rating !== undefined && {
      min_rating: newFilters.min_rating,
    }),
    ...(newFilters.max_price_tier !== undefined && {
      max_price_tier: newFilters.max_price_tier,
    }),
    ...(newFilters.max_distance_km !== undefined && {
      max_distance_km: newFilters.max_distance_km,
    }),
  };

  // Handle "not that one" — resolve exclude_ref and append to exclude_ids
  if (args.slots.exclude_ref) {
    let toExclude: string | null = null;
    if (
      args.slots.exclude_ref.type === "ordinal" &&
      args.snapshot?.contractorIds
    ) {
      const idx = args.slots.exclude_ref.position - 1;
      toExclude = args.snapshot.contractorIds[idx] ?? null;
    } else if (args.slots.exclude_ref.type === "name") {
      const found = await findContractorByName(args.slots.exclude_ref.name);
      toExclude = found?.id ?? null;
    }
    if (toExclude) {
      merged.exclude_ids = [
        ...(merged.exclude_ids ?? []),
        toExclude,
      ];
    }
  }

  // Describe what changed in human terms — used by the wrapper for narration.
  const changedBits: string[] = [];
  if (newFilters.locally_owned) changedBits.push("locally owned only");
  if (newFilters.same_day) changedBits.push("same-day only");
  if (newFilters.min_rating != null)
    changedBits.push(`min rating ${newFilters.min_rating}`);
  if (newFilters.max_price_tier != null)
    changedBits.push(`under ${"$".repeat(newFilters.max_price_tier)}`);
  if (newFilters.max_distance_km != null)
    changedBits.push(`within ${newFilters.max_distance_km} km`);
  if (args.slots.exclude_ref) changedBits.push("excluding the prior one");
  const changed = changedBits.join(", ") || "constraints unchanged";

  const result = await deliberate({
    user_id: args.user_id,
    category,
    constraints: merged,
    current_pick_ids: args.snapshot?.contractorIds,
  });
  if (!result.ok) {
    return {
      contextMessage: wrapFallback(
        `refinement (${changed}) returned no candidates`,
      ),
    };
  }
  return {
    variant: { kind: "compare", payload: result.payload },
    contextMessage: wrapDeliberateRefine({
      payload: result.payload,
      changed,
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

// ─── Appointment helpers ────────────────────────────────────────────

function appointmentRowToCard(
  row: AppointmentRow,
  contractorName: string | null = null,
): AppointmentCard {
  const d = new Date(row.scheduled_at);
  const whenText = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
  // Use "today" / "tomorrow" if applicable for nicer narration.
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow =
    d.getFullYear() === tomorrow.getFullYear() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getDate() === tomorrow.getDate();
  const friendlyTime = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
  const friendlyWhen = sameDay
    ? `today at ${friendlyTime}`
    : isTomorrow
      ? `tomorrow at ${friendlyTime}`
      : whenText;
  return {
    id: row.id,
    contractor_id: row.contractor_id,
    contractor_name: contractorName,
    scheduled_at: row.scheduled_at,
    scheduled_when_text: friendlyWhen,
    duration_minutes: row.duration_minutes,
    agenda: row.agenda,
    status: row.status,
  };
}

async function fetchContractorNameSafe(
  contractorId: string | null,
): Promise<string | null> {
  if (!contractorId) return null;
  const row = await fetchContractorById(contractorId).catch(() => null);
  return row?.name ?? null;
}

/**
 * Resolve which contractor a fresh schedule_appointment refers to. We
 * look at the current surface — if the user just booked someone, that's
 * who the appointment is with. Otherwise null (homeowner appointment
 * with no specific contractor).
 */
function resolveAppointmentContractor(
  snapshot?: SurfaceSnapshot,
): string | null {
  if (!snapshot?.contractorIds?.length) return null;
  return snapshot.contractorIds[0] ?? null;
}

async function handleScheduleAppointment(args: {
  slots: IntentSlots;
  user_id: string | null;
  snapshot?: SurfaceSnapshot;
}): Promise<
  | { variant: SurfaceVariant; contextMessage: string }
  | { contextMessage: string }
> {
  if (!args.user_id) {
    return {
      contextMessage: wrapFallback(
        "scheduling requires sign-in — appointments are user-scoped",
      ),
    };
  }
  if (!args.slots.when) {
    return {
      contextMessage: wrapFallback(
        "couldn't extract a date/time from the request",
      ),
    };
  }
  const contractorId = resolveAppointmentContractor(args.snapshot);
  const row = await createAppointment({
    user_id: args.user_id,
    contractor_id: contractorId,
    scheduled_at: args.slots.when.iso_utc,
    duration_minutes: 60,
    agenda: args.slots.agenda ?? "",
    context: { intake: "voice", matched_phrase: args.slots.when.phrase },
  });
  if (!row) {
    return {
      contextMessage: wrapFallback(
        "appointment insert failed — see server logs",
      ),
    };
  }
  const contractorName = await fetchContractorNameSafe(contractorId);
  const card = appointmentRowToCard(row, contractorName);
  return {
    variant: {
      kind: "appointment",
      payload: { appointments: [card], intent_kind: "scheduled" },
    },
    contextMessage: wrapAppointmentScheduled({ appointment: card }),
  };
}

async function handleRescheduleAppointment(args: {
  slots: IntentSlots;
  user_id: string | null;
  snapshot?: SurfaceSnapshot;
}): Promise<
  | { variant: SurfaceVariant; contextMessage: string }
  | { contextMessage: string }
> {
  if (!args.user_id) {
    return { contextMessage: wrapFallback("reschedule requires sign-in") };
  }
  if (!args.slots.when) {
    return {
      contextMessage: wrapFallback(
        "couldn't extract a new date/time from the request",
      ),
    };
  }
  // Resolve which appointment to reschedule — pick the next upcoming.
  // v1: simplest possible heuristic. v2 lets user say which by name/time.
  const upcoming = await listUpcomingAppointments({
    user_id: args.user_id,
    limit: 1,
  });
  if (upcoming.length === 0) {
    return {
      contextMessage: wrapFallback("no upcoming appointment to reschedule"),
    };
  }
  const target = upcoming[0];
  const row = await rescheduleAppointment({
    appointment_id: target.id,
    user_id: args.user_id,
    new_scheduled_at: args.slots.when.iso_utc,
    reason: "voice reschedule",
  });
  if (!row) {
    return {
      contextMessage: wrapFallback("reschedule update failed — see server logs"),
    };
  }
  const contractorName = await fetchContractorNameSafe(row.contractor_id);
  const card = appointmentRowToCard(row, contractorName);
  return {
    variant: {
      kind: "appointment",
      payload: { appointments: [card], intent_kind: "rescheduled" },
    },
    contextMessage: wrapAppointmentRescheduled({ appointment: card }),
  };
}

async function handleCancelAppointment(args: {
  user_id: string | null;
}): Promise<
  | { variant: SurfaceVariant; contextMessage: string }
  | { contextMessage: string }
> {
  if (!args.user_id) {
    return { contextMessage: wrapFallback("cancel requires sign-in") };
  }
  const upcoming = await listUpcomingAppointments({
    user_id: args.user_id,
    limit: 1,
  });
  if (upcoming.length === 0) {
    return {
      contextMessage: wrapFallback("no upcoming appointment to cancel"),
    };
  }
  const target = upcoming[0];
  const row = await cancelAppointment({
    appointment_id: target.id,
    user_id: args.user_id,
    reason: "voice cancel",
  });
  if (!row) {
    return {
      contextMessage: wrapFallback("cancel update failed — see server logs"),
    };
  }
  const contractorName = await fetchContractorNameSafe(row.contractor_id);
  const card = appointmentRowToCard(row, contractorName);
  return {
    variant: {
      kind: "appointment",
      payload: { appointments: [card], intent_kind: "cancelled" },
    },
    contextMessage: wrapAppointmentCancelled({ appointment: card }),
  };
}

async function handleViewAppointments(args: {
  user_id: string | null;
}): Promise<
  | { variant: SurfaceVariant; contextMessage: string }
  | { contextMessage: string }
> {
  if (!args.user_id) {
    return {
      contextMessage: wrapFallback("viewing requires sign-in"),
    };
  }
  const rows = await listUpcomingAppointments({
    user_id: args.user_id,
    limit: 10,
  });
  const cards: AppointmentCard[] = await Promise.all(
    rows.map(async (r) =>
      appointmentRowToCard(r, await fetchContractorNameSafe(r.contractor_id)),
    ),
  );
  return {
    variant: {
      kind: "appointment",
      payload: { appointments: cards, intent_kind: "list" },
    },
    contextMessage: wrapAppointmentsList({ appointments: cards }),
  };
}

// ─── Contract drafter (M3.7) ────────────────────────────────────────

const PLATFORM_FEE_PERCENT_FOR_DRAFT = (() => {
  const raw = process.env.PLATFORM_FEE_PERCENT;
  const n = raw != null ? parseFloat(raw) : NaN;
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 5;
})();
const PLATFORM_CURRENCY_FOR_DRAFT = (
  process.env.PLATFORM_CURRENCY || "usd"
).toLowerCase();

const MIN_DRAFT_AMOUNT_CENTS = 100;
const MAX_DRAFT_AMOUNT_CENTS = 5_000_000;

async function fetchHomeownerName(
  userId: string,
): Promise<{ name: string; email: string | null }> {
  try {
    const { url, serviceRoleKey } = getSupabaseAdminConfig();
    const res = await fetch(
      `${url}/rest/v1/users?id=eq.${encodeURIComponent(
        userId,
      )}&select=email,display_name&limit=1`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        cache: "no-store",
      },
    );
    if (!res.ok) return { name: "Homeowner", email: null };
    const rows = (await res.json()) as Array<{
      email: string | null;
      display_name: string | null;
    }>;
    const row = rows[0];
    return {
      name: row?.display_name ?? "Homeowner",
      email: row?.email ?? null,
    };
  } catch {
    return { name: "Homeowner", email: null };
  }
}

function buildContractBody(args: {
  homeownerName: string;
  contractorName: string;
  scope: string;
  amountCents: number;
  currency: string;
  platformFeeCents: number;
}): string {
  const dollars = (args.amountCents / 100).toFixed(2);
  const feeDollars = (args.platformFeeCents / 100).toFixed(2);
  const c = args.currency.toUpperCase();
  return [
    `WORK AGREEMENT`,
    ``,
    `Between: ${args.homeownerName} ("Homeowner")`,
    `And:     ${args.contractorName} ("Contractor")`,
    ``,
    `Scope of Work:`,
    args.scope,
    ``,
    `Total Compensation: ${dollars} ${c}`,
    `Platform Fee (deducted): ${feeDollars} ${c} (iSolveUrProblems)`,
    ``,
    `Both parties agree that:`,
    `  - Work will be performed in a workmanlike manner.`,
    `  - Payment will be released through the iSolveUrProblems platform.`,
    `  - Disputes will be handled per the iSolveUrProblems Terms of Service.`,
    `  - This agreement is enforceable as a written contract upon both signatures.`,
    ``,
    `By signing below, both parties acknowledge and agree to these terms.`,
  ].join("\n");
}

async function handleDraftContract(args: {
  slots: IntentSlots;
  user_id: string | null;
  snapshot?: SurfaceSnapshot;
}): Promise<
  | { variant: SurfaceVariant; contextMessage: string }
  | { contextMessage: string }
> {
  if (!args.user_id) {
    return {
      contextMessage: wrapFallback(
        "drafting a contract requires sign-in (contracts are user-scoped)",
      ),
    };
  }

  // Resolve the contractor — prefer the explicit slot ref, fall back to
  // whatever's at the top of the current surface (the post-deliberation
  // / post-booking flow naturally lands here).
  let contractorRef = args.slots.contractor_ref;
  if (!contractorRef && args.snapshot?.contractorIds?.length) {
    contractorRef = { type: "ordinal", position: 1 };
  }
  if (!contractorRef) {
    return {
      contextMessage: wrapFallback(
        "user wanted a contract but no contractor on screen and no name said",
      ),
    };
  }
  const resolved = await resolveContractorRef({
    ref: contractorRef,
    snapshot: args.snapshot,
  });
  if (!resolved) {
    return {
      contextMessage: wrapFallback(
        "couldn't identify the contractor for the contract",
      ),
    };
  }

  // Amount + scope must be present for v1.
  const amountCents = args.slots.amount_cents;
  if (
    typeof amountCents !== "number" ||
    !Number.isInteger(amountCents) ||
    amountCents < MIN_DRAFT_AMOUNT_CENTS ||
    amountCents > MAX_DRAFT_AMOUNT_CENTS
  ) {
    return {
      contextMessage: wrapFallback(
        "no clear dollar amount in the request — ask the user to say the price",
      ),
    };
  }
  const scope = args.slots.scope?.trim();
  if (!scope) {
    return {
      contextMessage: wrapFallback(
        "no scope phrase in the request — ask the user what the contract should cover",
      ),
    };
  }

  // Pull contractor row for name + email (uses the M2.5 helper).
  const contractor = await getContractorStripeRow(resolved.id).catch(
    () => null,
  );
  if (!contractor) {
    return {
      contextMessage: wrapFallback(
        "contractor row lookup failed during contract draft",
      ),
    };
  }

  const homeowner = await fetchHomeownerName(args.user_id);
  const platformFeeCents = computePlatformFeeCents(
    amountCents,
    PLATFORM_FEE_PERCENT_FOR_DRAFT,
  );

  let contractRow;
  try {
    contractRow = await insertContract({
      user_id: args.user_id,
      contractor_id: resolved.id,
      category: "general",
      amount_cents: amountCents,
      platform_fee_cents: platformFeeCents,
      currency: PLATFORM_CURRENCY_FOR_DRAFT,
      candidate_ids: args.snapshot?.contractorIds ?? [],
      context: { source: "m3.7_voice_draft", scope },
    });
  } catch (e) {
    return {
      contextMessage: wrapFallback(
        `contract insert failed: ${e instanceof Error ? e.message : "unknown"}`,
      ),
    };
  }

  const docBody = buildContractBody({
    homeownerName: homeowner.name,
    contractorName: contractor.name,
    scope,
    amountCents,
    currency: PLATFORM_CURRENCY_FOR_DRAFT,
    platformFeeCents,
  });

  const provider = getEsignProvider();
  const env = await provider.createEnvelope({
    contract_id: contractRow.id,
    title: `Work agreement — ${contractor.name}`,
    body: docBody,
    signers: [
      { role: "user", name: homeowner.name, email: homeowner.email },
      {
        role: "contractor",
        name: contractor.name,
        email: contractor.email,
      },
    ],
    return_url: "",
  });

  if (!env.ok) {
    return {
      contextMessage: wrapFallback(`esign provider failed: ${env.error}`),
    };
  }

  try {
    await setContractEsign({
      contract_id: contractRow.id,
      user_id: args.user_id,
      esign_provider: getProviderNameFromEnv(),
      esign_envelope_id: env.envelope_id,
      esign_envelope_status: env.status,
      esign_signing_url_user: env.signing_url_by_role.user,
      esign_signing_url_contractor: env.signing_url_by_role.contractor,
      scope,
      stamp_signed_now: env.status === "signed",
    });
  } catch (e) {
    return {
      contextMessage: wrapFallback(
        `contract esign patch failed: ${e instanceof Error ? e.message : "unknown"}`,
      ),
    };
  }

  const payload: ContractPayload = {
    contract_id: contractRow.id,
    contractor_name: contractor.name,
    scope,
    amount_cents: amountCents,
    platform_fee_cents: platformFeeCents,
    currency: PLATFORM_CURRENCY_FOR_DRAFT,
    envelope: {
      provider: getProviderNameFromEnv(),
      envelope_id: env.envelope_id,
      status: env.status,
      signing_url_user: env.signing_url_by_role.user,
      signing_url_contractor: env.signing_url_by_role.contractor,
    },
  };

  return {
    variant: { kind: "contract", payload },
    contextMessage: wrapDraftContract({ payload }),
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
    case "deliberate_open": {
      const r = await handleDeliberateOpen({
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
    case "deliberate_refine": {
      const r = await handleDeliberateRefine({
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
    case "schedule_appointment": {
      const r = await handleScheduleAppointment({
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
    case "reschedule_appointment": {
      const r = await handleRescheduleAppointment({
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
    case "cancel_appointment": {
      const r = await handleCancelAppointment({
        user_id: input.user_id,
      });
      return {
        kind: "action",
        classification,
        variant: "variant" in r ? r.variant : undefined,
        contextMessage: r.contextMessage,
      };
    }
    case "view_appointments": {
      const r = await handleViewAppointments({
        user_id: input.user_id,
      });
      return {
        kind: "action",
        classification,
        variant: "variant" in r ? r.variant : undefined,
        contextMessage: r.contextMessage,
      };
    }
    case "draft_contract": {
      const r = await handleDraftContract({
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
  }
}
