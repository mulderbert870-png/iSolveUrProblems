/**
 * M3.0e — Intent classifier types.
 *
 * 4 intents power the M3.0d test drive:
 *   - find_contractor  → user wants a list of contractors for a category
 *   - tell_me_more     → user wants details about a specific contractor
 *   - recommend        → user wants 6's top picks with reasons
 *   - book             → user wants to choose a contractor (fires M2.6
 *                         simulation in v1 test drive)
 *
 * The classifier is rules-based (regex) for v1 to keep latency <50 ms.
 * Slot extraction returns explicit structured data; the orchestrator
 * uses slots to call the right M2 backend route.
 *
 * "Contractor refs" are how the user identifies a specific contractor —
 * either by ordinal position in the most-recent list ("the first one",
 * "#2") or by name ("Acme Plumbing"). The client resolves ordinals
 * against the current assistant-surface state at action time.
 */

export type IntentKind =
  | "find_contractor"
  | "tell_me_more"
  | "recommend"
  | "book";

/** A reference to a specific contractor in conversation context. */
export type ContractorRef =
  | { type: "ordinal"; position: number }
  | { type: "name"; name: string };

/** Slot bag — only the union of fields any intent uses. */
export type IntentSlots = {
  /** Category slug (matches M2's 15-category taxonomy). */
  category?: string;
  /** A textual location string the user said ("Austin, TX"). */
  location_text?: string;
  /** Resolved lat/lng. The orchestrator handles the lookup. */
  location?: { lat: number; lng: number };
  /** Reference to a specific contractor (for tell_me_more / book). */
  contractor_ref?: ContractorRef;
  /** Filters mentioned (locally-owned, same-day, min-rating, etc.). */
  filters?: {
    locally_owned?: boolean;
    same_day?: boolean;
    min_rating?: number;
    max_price_tier?: 1 | 2 | 3 | 4;
  };
};

/** Confidence buckets — chosen at classify time, used by orchestrator. */
export type IntentConfidence = "high" | "medium" | "low";

export type IntentClassification = {
  kind: IntentKind;
  slots: IntentSlots;
  confidence: IntentConfidence;
  /** The matched regex / rule identifier — for diagnostic logging. */
  matched_rule: string;
};

/** Either a classification or an explicit "no match". */
export type ClassifyResult =
  | { matched: true; classification: IntentClassification }
  | { matched: false; reason: string };
