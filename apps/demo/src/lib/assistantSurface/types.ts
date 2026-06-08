/**
 * Assistant Surface — types (M3.0b).
 *
 * The "results pop up on screen" right-side drawer that 6 drives during
 * voice conversations. Lives at the locale layout level so it persists
 * across navigation. The chat intent classifier (M3.0e) and any other
 * voice-driven action source can push variants into the store; the
 * surface component reads the active variant and renders the matching
 * panel.
 *
 * v1 covers exactly the four variants the M3.0d voice test drive needs:
 *   - contractors: ranked search results
 *   - summary:     review synthesis for one contractor
 *   - picks:       top 3 recommendations
 *   - pickResult:  win/lose notification dispatch outcome
 *
 * These are deliberately slim, client-friendly subsets of the M2 server
 * types. The orchestrator (M3.0e) maps server responses to these.
 */

/** Slim contractor card shape — only the fields the surface renders. */
export type ContractorCard = {
  id: string;
  name: string;
  rating_avg: number | null;
  rating_count: number | null;
  distance_km: number;
  price_tier: number | null;
  locally_owned: boolean | null;
  same_day_flag: boolean | null;
  licensed_flag: boolean | null;
  phone: string | null;
  website: string | null;
  /** Optional composite score 0..1 from the recommender. */
  score?: number;
};

/** A single recommendation pick — same as ContractorCard plus a reason. */
export type RecommendationCard = ContractorCard & {
  reason: string;
};

/** Review-summary payload as the surface needs it. */
export type SummaryPayload = {
  contractor_id: string;
  contractor_name: string;
  summary: string;
  strengths_md: string;
  weaknesses_md: string;
  sample_quotes: Array<{ quote: string; rating: number | null }>;
};

/** Win/lose dispatch result — one entry per notified contractor. */
export type PickResultPerson = {
  contractor_id: string;
  name: string;
  channel: string | null;
  delivered: boolean;
  error?: string;
};

export type PickResultPayload = {
  winner: PickResultPerson | null;
  losers: PickResultPerson[];
  total_sent: number;
  total_failed: number;
};

/** The variant union — discriminated by `kind`. */
export type SurfaceVariant =
  | { kind: "contractors"; hits: ContractorCard[]; total_considered: number }
  | { kind: "summary"; payload: SummaryPayload; cached: boolean }
  | {
      kind: "picks";
      picks: RecommendationCard[];
      preference_facts: string[];
    }
  | { kind: "pickResult"; payload: PickResultPayload };

export type SurfaceVariantKind = SurfaceVariant["kind"];
