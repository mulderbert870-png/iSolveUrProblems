import type { PriceTier } from "../types";

/**
 * Source-adapter contract. Every data source (mock, SerpAPI, Yelp, BBB)
 * implements this. The orchestrator (`refresh.ts`) doesn't care which
 * source it talks to — it just upserts whatever `fetchByCategory()`
 * returns.
 *
 * For M2.1 dev we ship a `mock` adapter. When SG Dietz unblocks vendor
 * choice (Q2.1a), we'll add `serpapi.ts` and swap via env. No call site
 * changes.
 */
export interface ContractorSourceAdapter {
  /** Identifier persisted into contractors.source. */
  readonly name: string;

  /** Whether this adapter is usable in the current environment. */
  readonly isConfigured: boolean;

  fetchByCategory(args: {
    category: string;
    /** Center point for the search. */
    near: { lat: number; lng: number };
    /** Search radius in kilometers. */
    radiusKm: number;
    /** Max results to return. */
    limit?: number;
  }): Promise<RawContractor[]>;
}

/** Source-agnostic payload the adapter returns; orchestrator upserts these. */
export type RawContractor = {
  /** Unique within the source (Google Place ID, Yelp business id, etc.). */
  source_id: string;
  name: string;
  phone?: string | null;
  website?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  lat?: number | null;
  lng?: number | null;
  categories?: string[];
  price_tier?: PriceTier | null;
  licensed_flag?: boolean | null;
  same_day_flag?: boolean | null;
  locally_owned?: boolean | null;
  rating_avg?: number | null;
  rating_count?: number | null;
  /** Optional reviews bundled with the contractor record. */
  reviews?: RawContractorReview[];
  /** The raw payload as returned by the source — stored as-is for audit. */
  scraped_payload: Record<string, unknown>;
};

export type RawContractorReview = {
  source_review_id: string;
  rating?: number | null;
  body?: string | null;
  reviewer_name?: string | null;
  reviewed_at?: string | null;
  scraped_payload?: Record<string, unknown>;
};
