/**
 * M3.0e — Slot extraction helpers.
 *
 * Pure regex / lookup table. No LLM calls.
 */

import type { ContractorRef } from "./types";

// ─── Category extraction ────────────────────────────────────────────

/**
 * Maps natural-language words a user might say to one of M2's 15
 * category slugs. Order matters — more specific entries first.
 */
const CATEGORY_WORDS: Array<{ slug: string; words: readonly string[] }> = [
  { slug: "plumber",    words: ["plumber", "plumbing", "drain", "pipe"] },
  { slug: "electrician", words: ["electrician", "electrical", "electric"] },
  { slug: "hvac",       words: ["hvac", "a/c", "ac", "air condition", "heating", "furnace"] },
  { slug: "roofer",     words: ["roofer", "roofing", "roof"] },
  { slug: "landscaper", words: ["landscaper", "landscaping", "lawn", "yard", "gardener"] },
  { slug: "painter",    words: ["painter", "painting"] },
  { slug: "handyman",   words: ["handyman", "handy man"] },
  { slug: "carpenter",  words: ["carpenter", "carpentry", "woodwork"] },
  { slug: "flooring",   words: ["flooring", "floor", "hardwood", "tile floor"] },
  { slug: "appliance",  words: ["appliance"] },
  { slug: "cleaning",   words: ["cleaner", "cleaning", "house clean"] },
  { slug: "pest",       words: ["pest", "exterminator", "bug"] },
  { slug: "garage_door", words: ["garage door"] },
  { slug: "window",     words: ["window", "siding", "glazier"] },
  // "general" is intentionally last — broadest match
  { slug: "general",    words: ["general contractor", "contractor", "builder", "renovation"] },
];

export function extractCategory(text: string): string | undefined {
  const t = text.toLowerCase();
  for (const { slug, words } of CATEGORY_WORDS) {
    if (words.some((w) => t.includes(w))) return slug;
  }
  return undefined;
}

// ─── Location extraction ────────────────────────────────────────────

/**
 * Cities the test drive recognizes. If the user names a city we
 * recognize, we extract lat/lng. Otherwise the orchestrator falls back
 * to a default center (configurable below).
 *
 * Adding a city is a 1-line change. Long term this becomes geocoding.
 */
const KNOWN_CITIES: Record<string, { lat: number; lng: number }> = {
  // US metros (the M3.0d test drive lives here)
  "austin":         { lat: 30.2672, lng: -97.7431 },
  "new york":       { lat: 40.7128, lng: -74.0060 },
  "nyc":            { lat: 40.7128, lng: -74.0060 },
  "los angeles":    { lat: 34.0522, lng: -118.2437 },
  "la":             { lat: 34.0522, lng: -118.2437 },
  "chicago":        { lat: 41.8781, lng: -87.6298 },
  "houston":        { lat: 29.7604, lng: -95.3698 },
  "miami":          { lat: 25.7617, lng: -80.1918 },
  "san francisco":  { lat: 37.7749, lng: -122.4194 },
  "sf":             { lat: 37.7749, lng: -122.4194 },
  "seattle":        { lat: 47.6062, lng: -122.3321 },
  "boston":         { lat: 42.3601, lng: -71.0589 },
  "denver":         { lat: 39.7392, lng: -104.9903 },
  "dallas":         { lat: 32.7767, lng: -96.7970 },
  "atlanta":        { lat: 33.7490, lng: -84.3880 },
  "phoenix":        { lat: 33.4484, lng: -112.0740 },
  "san diego":      { lat: 32.7157, lng: -117.1611 },
  // International (locales the app supports)
  "london":         { lat: 51.5074, lng: -0.1278 },
  "paris":          { lat: 48.8566, lng: 2.3522 },
  "berlin":         { lat: 52.5200, lng: 13.4050 },
  "madrid":         { lat: 40.4168, lng: -3.7038 },
  "lisbon":         { lat: 38.7223, lng: -9.1393 },
  "beijing":        { lat: 39.9042, lng: 116.4074 },
  "shanghai":       { lat: 31.2304, lng: 121.4737 },
};

export const DEFAULT_CENTER = { lat: 30.2672, lng: -97.7431 }; // Austin

/** Extract city name + coords from a phrase like "near Austin", "in NYC". */
export function extractLocation(
  text: string,
): { text: string; coords: { lat: number; lng: number } } | undefined {
  const t = text.toLowerCase();
  // Cheapest path: any of the known city names appears anywhere in the text.
  // Two-pass to prefer longer/multiword matches first (so "san francisco"
  // wins over "san").
  const cities = Object.entries(KNOWN_CITIES).sort(
    ([a], [b]) => b.length - a.length,
  );
  for (const [city, coords] of cities) {
    // Word boundary on both ends to avoid matching "austin" inside "austinite".
    const re = new RegExp(`\\b${city.replace(/\s+/g, "\\s+")}\\b`, "i");
    if (re.test(t)) {
      return { text: city, coords };
    }
  }
  return undefined;
}

// ─── Contractor reference extraction ────────────────────────────────

/**
 * Spelled-out small numbers we accept as ordinals.
 *
 * Iteration order matters — we try entries in declaration order, and the
 * regex matches the word with an OPTIONAL trailing "one" ("the second
 * one"). Multi-word ordinals MUST come before the bare "one" entry, or
 * "the second one" would match "one" first and resolve to position 1.
 *
 * The bare "one" handles "tell me about one of them" / "give me one"
 * but is intentionally LAST so concrete ordinals win the precedence
 * battle.
 */
const SPELLED_ORDINALS: Array<{ word: string; n: number }> = [
  { word: "first",  n: 1 },
  { word: "1st",    n: 1 },
  { word: "top",    n: 1 },
  { word: "second", n: 2 },
  { word: "2nd",    n: 2 },
  { word: "two",    n: 2 },
  { word: "third",  n: 3 },
  { word: "3rd",    n: 3 },
  { word: "three",  n: 3 },
  { word: "fourth", n: 4 },
  { word: "4th",    n: 4 },
  { word: "four",   n: 4 },
  { word: "fifth",  n: 5 },
  { word: "5th",    n: 5 },
  { word: "five",   n: 5 },
  // bare "one" last — see comment above
  { word: "one",    n: 1 },
];

/**
 * Extract a contractor reference from a phrase like "the first one",
 * "#2", "Acme Plumbing". Returns undefined when no clear ref is found.
 */
export function extractContractorRef(
  text: string,
): ContractorRef | undefined {
  const t = text.toLowerCase();

  // Pattern: "#1", "#2", "number 3"
  const hash = t.match(/(?:^|\s)#\s*(\d+)/);
  if (hash) {
    const n = parseInt(hash[1], 10);
    if (n >= 1 && n <= 20) return { type: "ordinal", position: n };
  }
  const numberWord = t.match(/\bnumber\s+(\d+)\b/);
  if (numberWord) {
    const n = parseInt(numberWord[1], 10);
    if (n >= 1 && n <= 20) return { type: "ordinal", position: n };
  }

  // Pattern: "the first one", "the top one", "the second", "the 2nd"
  for (const { word, n } of SPELLED_ORDINALS) {
    const re = new RegExp(`\\b(?:the\\s+)?${word}(?:\\s+one)?\\b`, "i");
    if (re.test(t)) return { type: "ordinal", position: n };
  }

  // Pattern: name extraction — "about Acme", "about Sunrise Drainworks",
  // "with Acme Plumbing". Capture up to 4 words after the trigger.
  const nameMatch = text.match(
    /\b(?:about|with|go\s+with|book|pick|hire|tell\s+me\s+about|more\s+on)\s+([A-Z][\w&'.-]*(?:\s+[A-Z][\w&'.-]*){0,3})/,
  );
  if (nameMatch) {
    return { type: "name", name: nameMatch[1].trim() };
  }

  return undefined;
}

// ─── Filter extraction ──────────────────────────────────────────────

/**
 * Extract a dollar amount in cents from natural language. Handles:
 *   "$500"           → 50000
 *   "500 dollars"    → 50000
 *   "$1,250"         → 125000
 *   "twenty bucks"   → ... (skipped — not enough signal in v1)
 *   "2.5k"           → 250000
 *
 * Returns undefined if nothing convincing is found.
 */
export function extractAmount(text: string): number | undefined {
  const t = text.toLowerCase();

  // "$1,250" / "$500" / "$2,500.00"
  const dollar = t.match(/\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/);
  if (dollar) {
    const raw = dollar[1].replace(/,/g, "");
    const n = parseFloat(raw);
    if (Number.isFinite(n) && n > 0) return Math.round(n * 100);
  }

  // "500 dollars" / "1,250 dollars" / "500 bucks"
  const spelled = t.match(
    /\b(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s*(?:dollars?|bucks?|usd)\b/,
  );
  if (spelled) {
    const raw = spelled[1].replace(/,/g, "");
    const n = parseFloat(raw);
    if (Number.isFinite(n) && n > 0) return Math.round(n * 100);
  }

  // "2k" / "1.5k" — k-suffix abbreviation
  const kSuffix = t.match(/\b(\d+(?:\.\d+)?)\s*k\b/);
  if (kSuffix) {
    const n = parseFloat(kSuffix[1]);
    if (Number.isFinite(n) && n > 0) return Math.round(n * 1000 * 100);
  }

  return undefined;
}

/**
 * M3.9 — Pull a complaint phrase out of a "file a dispute / complaint"
 * utterance. Patterns covered:
 *   "file a complaint because X"
 *   "I want to dispute, X did a terrible job"
 *   "open a dispute about the work — X"
 *
 * Best-effort. The orchestrator falls back to using the full utterance
 * as the complaint when this returns undefined.
 */
export function extractComplaint(text: string): string | undefined {
  // Pattern: "...because/since/about/that <complaint>"
  const m = text.match(
    /\b(?:because|since|about|that|—|–|-)\s+(.{4,300})$/i,
  );
  if (m) {
    const phrase = m[1].trim().replace(/[.!?,;\s]+$/, "");
    if (phrase.length >= 4) return phrase;
  }
  // Pattern: ", <complaint>" — anything after a comma following the
  // dispute-opener phrase.
  const after = text.match(
    /\b(?:file|open|start|begin)\s+(?:a\s+)?(?:dispute|complaint|grievance),?\s+(.{4,300})$/i,
  );
  if (after) {
    const phrase = after[1].trim().replace(/[.!?,;\s]+$/, "");
    if (phrase.length >= 4) return phrase;
  }
  return undefined;
}

/**
 * Pull out a free-form scope phrase from "for X" / "to do Y" patterns.
 * Used by draft_contract. Best-effort; returns undefined if nothing
 * useful matches.
 */
export function extractScope(text: string): string | undefined {
  // "...for installing the new water heater"
  const m = text.match(
    /\b(?:for|to)\s+([a-z][\w\s-]{4,120})(?:\s+(?:for\s+\$|at\s+\$|,|\.|$))/i,
  );
  if (m) return m[1].trim();
  return undefined;
}

export function extractFilters(text: string): {
  locally_owned?: boolean;
  same_day?: boolean;
  min_rating?: number;
  max_price_tier?: 1 | 2 | 3 | 4;
  max_distance_km?: number;
} {
  const t = text.toLowerCase();
  const out: ReturnType<typeof extractFilters> = {};

  if (/\b(local|locally[- ]owned|small business|mom[- ]and[- ]pop)\b/.test(t)) {
    out.locally_owned = true;
  }
  if (/\b(same[- ]day|today|right now|asap|emergency|urgent)\b/.test(t)) {
    out.same_day = true;
  }
  if (/\b(cheap|cheapest|afford|budget|inexpensive|low[- ]cost)\b/.test(t)) {
    out.max_price_tier = 2;
  }
  if (/\b4\.5\s*stars?\b|\b4\.5\+|\b4\.5\s*or\s*higher/.test(t)) {
    out.min_rating = 4.5;
  } else if (/\btop[- ]rated|\bhighly\s*rated|\bbest\s*reviewed/.test(t)) {
    out.min_rating = 4.5;
  }

  // Distance — "closer than 5 km", "within 10 km", "no more than 3 km"
  const kmMatch = t.match(
    /\b(?:closer\s+than|within|less\s+than|no\s+more\s+than|under)\s+(\d+(?:\.\d+)?)\s*(?:km|kilometers?|kilometres?|miles?|mi)\b/,
  );
  if (kmMatch) {
    const n = parseFloat(kmMatch[1]);
    if (!Number.isNaN(n) && n > 0 && n <= 200) {
      // Convert miles to km if the unit was miles.
      const isMiles = /mi(?:les?)?\b/.test(kmMatch[0]);
      out.max_distance_km = isMiles ? Math.round(n * 1.609 * 10) / 10 : n;
    }
  }

  return out;
}
