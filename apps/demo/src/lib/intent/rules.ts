/**
 * M3.0e — Intent rules.
 *
 * Each rule maps a regex pattern (or set of patterns) to one of the 4
 * core intents. Rules are evaluated in priority order — first match
 * wins. More specific patterns come first; broader ones last.
 *
 * Confidence:
 *   - high: the rule fired AND all required slots resolved
 *   - medium: rule fired, some slots present, others missing (orchestrator
 *     fills defaults)
 *   - low: weak match (kept for diagnostic logging, not actioned)
 *
 * Verbal patterns are anchored loosely — speech-to-text often drops
 * articles ("a", "the"), capitalizes inconsistently, and inserts filler
 * words. Patterns tolerate that.
 */

import {
  extractCategory,
  extractContractorRef,
  extractFilters,
  extractLocation,
} from "./slots";
import type { ClassifyResult, IntentSlots } from "./types";

type Rule = {
  id: string;
  /** Returns truthy if the rule matches; falsy otherwise. */
  match: (text: string) => boolean;
  /** Builds slots from the text + extractors. */
  build: (text: string) => IntentSlots;
  /** The intent kind this rule produces. */
  kind:
    | "find_contractor"
    | "tell_me_more"
    | "recommend"
    | "book"
    | "deliberate_open"
    | "deliberate_refine";
  /** Required slot keys — if any are missing the result is "medium". */
  required: Array<keyof IntentSlots>;
};

const RULES: readonly Rule[] = [
  // ─── DELIBERATE_REFINE ────────────────────────────────────────────
  // Highest priority — phrases like "not that one, too far" should
  // beat both book.imperative AND recommend.which.
  {
    id: "deliberate.refine.not_that_one",
    match: (t) =>
      /\bnot\s+(that|the\s+first|the\s+top|that\s+one|him|her|them)\b/i.test(
        t,
      ),
    build: (t) => {
      const filters = extractFilters(t);
      return {
        exclude_ref: extractContractorRef(t) ?? {
          type: "ordinal",
          position: 1,
        },
        filters: Object.keys(filters).length > 0 ? filters : undefined,
      };
    },
    kind: "deliberate_refine",
    required: [],
  },
  {
    id: "deliberate.refine.add_constraint",
    match: (t) =>
      /\b(only|just)\s+(local|locally|same[- ]day|under|cheaper|highly\s+rated|top[- ]rated)|\b(closer\s+than|within|less\s+than|no\s+more\s+than|under)\s+\d+\s*(?:km|kilometers?|miles?|mi)\b/i.test(
        t,
      ),
    build: (t) => {
      const filters = extractFilters(t);
      return {
        filters: Object.keys(filters).length > 0 ? filters : undefined,
      };
    },
    kind: "deliberate_refine",
    required: ["filters"],
  },
  // ─── DELIBERATE_OPEN ──────────────────────────────────────────────
  // "I can't decide", "help me decide" — invitation to open the
  // deliberation panel.
  {
    id: "deliberate.open",
    match: (t) =>
      /\b(i\s+can'?t\s+decide|i\s+don'?t\s+know\s+which|help\s+me\s+(decide|choose|pick)|hard\s+to\s+choose|compare\s+(them|those|these))\b/i.test(
        t,
      ),
    build: () => ({}),
    kind: "deliberate_open",
    required: [],
  },
  // ─── BOOK ─────────────────────────────────────────────────────────
  // High priority — must match before any of the other intents
  // accidentally claim a "book" phrase.
  {
    id: "book.imperative",
    match: (t) =>
      /\b(book|hire|choose|go\s+with|let'?s\s+go\s+with|i'?ll\s+take|let'?s\s+do)\b/i.test(
        t,
      ),
    build: (t) => ({
      contractor_ref: extractContractorRef(t),
    }),
    kind: "book",
    required: ["contractor_ref"],
  },
  // ─── TELL_ME_MORE ─────────────────────────────────────────────────
  {
    id: "tell_me_more.about",
    match: (t) =>
      /\b(tell\s+me\s+more|more\s+(about|on|info)|what'?s\s+up\s+with|what\s+about|how\s+about)\b/i.test(
        t,
      ),
    build: (t) => ({
      contractor_ref: extractContractorRef(t),
    }),
    kind: "tell_me_more",
    required: ["contractor_ref"],
  },
  // ─── RECOMMEND ────────────────────────────────────────────────────
  {
    id: "recommend.which",
    match: (t) =>
      /\b(which\s+(one|should|do\s+you)|what\s+do\s+you\s+(recommend|suggest|think)|who\s+should|what\s+would\s+you\s+pick|help\s+me\s+(decide|choose)|i\s+can'?t\s+decide)\b/i.test(
        t,
      ),
    build: () => ({}),
    kind: "recommend",
    required: [],
  },
  // ─── FIND_CONTRACTOR ──────────────────────────────────────────────
  // Both "find X near Y" and bare "I need an X" forms.
  {
    id: "find.imperative",
    match: (t) =>
      /\b(find|search|look\s+for|need|want|get)\b.+\b(plumber|electrician|hvac|a\/c|ac|roofer|landscaper|painter|handyman|carpenter|flooring|appliance|cleaner|cleaning|pest|garage\s+door|window|siding|contractor|builder|gardener)\b/i.test(
        t,
      ),
    build: (t) => {
      const category = extractCategory(t);
      const location = extractLocation(t);
      const filters = extractFilters(t);
      return {
        category,
        location_text: location?.text,
        location: location?.coords,
        filters: Object.keys(filters).length > 0 ? filters : undefined,
      };
    },
    kind: "find_contractor",
    required: ["category"],
  },
  // Bare category mention — "I have a plumbing problem", "my AC is broken"
  {
    id: "find.bare_category",
    match: (t) =>
      /\b(plumbing|electrical|hvac|a\/c|ac|roof|landscaping|painting|handyman|carpentry|flooring|appliance|pest|garage\s+door|window\b.+broken|leak|drain|clog)\b/i.test(
        t,
      ),
    build: (t) => {
      const category = extractCategory(t);
      const location = extractLocation(t);
      const filters = extractFilters(t);
      return {
        category,
        location_text: location?.text,
        location: location?.coords,
        filters: Object.keys(filters).length > 0 ? filters : undefined,
      };
    },
    kind: "find_contractor",
    required: ["category"],
  },
];

/** Try every rule in priority order. Returns the first match (or no-match). */
export function applyRules(text: string): ClassifyResult {
  const trimmed = text.trim();
  if (!trimmed) return { matched: false, reason: "empty text" };

  for (const rule of RULES) {
    if (!rule.match(trimmed)) continue;
    const slots = rule.build(trimmed);
    const missingRequired = rule.required.filter(
      (k) => slots[k] === undefined,
    );
    return {
      matched: true,
      classification: {
        kind: rule.kind,
        slots,
        confidence: missingRequired.length === 0 ? "high" : "medium",
        matched_rule: rule.id,
      },
    };
  }

  return { matched: false, reason: "no rule matched" };
}
