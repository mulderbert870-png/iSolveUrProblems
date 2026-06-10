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

/** Spelled-out small numbers we accept as ordinals. */
const SPELLED_ORDINALS: Record<string, number> = {
  "first": 1,
  "1st": 1,
  "top": 1,
  "one": 1,
  "second": 2,
  "2nd": 2,
  "two": 2,
  "third": 3,
  "3rd": 3,
  "three": 3,
  "fourth": 4,
  "4th": 4,
  "four": 4,
  "fifth": 5,
  "5th": 5,
  "five": 5,
};

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
  for (const [word, n] of Object.entries(SPELLED_ORDINALS)) {
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
