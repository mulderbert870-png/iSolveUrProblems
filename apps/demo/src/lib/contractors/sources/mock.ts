import type {
  ContractorSourceAdapter,
  RawContractor,
  RawContractorReview,
} from "./types";

/**
 * Mock contractor source. Deterministic-seeded fake data so the rest of
 * M2 (search, summarizer, recommender, win/lose) can be built and
 * end-to-end tested before SG Dietz unblocks the real data vendor
 * (SerpAPI / etc.).
 *
 * - 50 contractors generated per `fetchByCategory` call, distributed in
 *   a ring around the requested center point.
 * - Ratings + review counts + sentiment biased so the search ranking
 *   has meaningful variance.
 * - Each contractor carries 3–8 fake reviews so the M2.3 summarizer
 *   has something to chew on.
 *
 * Swap with the SerpAPI adapter when SG Dietz hands off the API key.
 */

const FIRST_WORDS = [
  "Acme", "Anchor", "Apex", "Atlas", "Bay", "Beacon", "Bluebird", "Capitol",
  "Cardinal", "Cascade", "Cedar", "Citywide", "Cobalt", "Cornerstone", "Crown",
  "Diamond", "Eagle", "Elite", "Evergreen", "First", "Foundation", "Frontier",
  "Heritage", "Heroic", "Honest", "Ironclad", "Keystone", "Laurel", "Liberty",
  "Lighthouse", "Lone Star", "Maple", "Mountain", "Northstar", "Oak", "Pacific",
  "Pinnacle", "Pioneer", "Premier", "Quality", "Ridgeline", "River", "Royal",
  "Sage", "Silverline", "Skyline", "Stellar", "Sterling", "Summit", "Sun Belt",
  "Sunrise", "Sunset", "Sure-Fix", "Three Rivers", "Trinity", "TrueBuild",
  "Valor", "Victory", "Westside", "Whitestone", "Yellowstone",
];

const SECOND_WORDS_BY_CATEGORY: Record<string, string[]> = {
  plumber:     ["Plumbing", "Plumbing & Drain", "Plumbing Co", "Pipe Works"],
  electrician: ["Electric", "Electrical", "Electrical Co", "Wiring Co"],
  hvac:        ["HVAC", "Air & Heating", "Climate Control", "Cooling"],
  roofer:      ["Roofing", "Roof Works", "Roof Co", "Shingle & Stone"],
  landscaper:  ["Landscaping", "Lawn & Garden", "Outdoor Co", "Greenscape"],
  painter:     ["Painting", "Painters", "Brush Works", "Finishes"],
  handyman:    ["Handyman", "Home Repair", "Fix-It", "Helper Crew"],
  general:     ["Construction", "Build Co", "General Contracting", "Renovations"],
  carpenter:   ["Carpentry", "Wood Works", "Craftworks"],
  flooring:    ["Flooring", "Floor Co", "Floors & Tile"],
  appliance:   ["Appliance Repair", "Appliances", "Repair Co"],
  cleaning:    ["Cleaning", "Cleaners", "Clean Co"],
  pest:        ["Pest Control", "Exterminators", "Pest Co"],
  garage_door: ["Garage Door Co", "Doors & Openers", "Garage Tech"],
  window:      ["Windows & Siding", "Window Co", "Glass & Pane"],
};

const REVIEW_POSITIVE = [
  "Showed up exactly when they said they would. Fixed the issue in under an hour. Professional and clean.",
  "Hands-down the best contractor I've used in this city. Fair price, no upsell, did the job right the first time.",
  "Honest pricing, no hidden fees, and they cleaned up after themselves. Will absolutely call again.",
  "Highly recommend. Took the time to explain what was wrong and how they fixed it.",
  "Quick response on a weekend emergency. Saved me from a much bigger headache.",
  "Reasonable quote, finished ahead of schedule. Five stars all the way.",
];
const REVIEW_MIXED = [
  "Did the work fine, but showed up 45 minutes late and didn't call ahead.",
  "Quality was OK. Pricing was a bit higher than competitors but they got it done.",
  "Friendly crew, but the job took two extra days. Final result was fine.",
];
const REVIEW_NEGATIVE = [
  "Quoted one price, billed another. Wouldn't use again.",
  "Took three visits to fix the same issue. Frustrating.",
  "Communication was poor — texts went unanswered for days.",
];

/** Mulberry32 PRNG — deterministic so the same seed always yields the same data. */
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rand: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

/** Offset a lat/lng by a random km distance up to radiusKm. */
function jitterLatLng(
  rand: () => number,
  center: { lat: number; lng: number },
  radiusKm: number,
): { lat: number; lng: number } {
  // ~111 km per degree latitude; lng degree shrinks by cos(lat).
  const r = radiusKm * Math.sqrt(rand());           // uniform-in-disc
  const theta = 2 * Math.PI * rand();
  const dLat = (r * Math.cos(theta)) / 111;
  const dLng =
    (r * Math.sin(theta)) /
    (111 * Math.cos((center.lat * Math.PI) / 180));
  return { lat: center.lat + dLat, lng: center.lng + dLng };
}

function makeReviews(rand: () => number, count: number): RawContractorReview[] {
  const out: RawContractorReview[] = [];
  for (let i = 0; i < count; i++) {
    const r = rand();
    const rating = r > 0.7 ? 5 : r > 0.4 ? 4 : r > 0.2 ? 3 : r > 0.1 ? 2 : 1;
    const body =
      rating >= 4
        ? pick(rand, REVIEW_POSITIVE)
        : rating === 3
          ? pick(rand, REVIEW_MIXED)
          : pick(rand, REVIEW_NEGATIVE);
    const daysAgo = Math.floor(rand() * 720); // up to ~2 years ago
    const reviewedAt = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
    out.push({
      source_review_id: `mock_review_${rand().toString(36).slice(2, 12)}`,
      rating,
      body,
      reviewer_name: `Reviewer ${Math.floor(rand() * 9999)}`,
      reviewed_at: reviewedAt,
    });
  }
  return out;
}

class MockAdapter implements ContractorSourceAdapter {
  readonly name = "mock";
  readonly isConfigured = true;

  async fetchByCategory(args: {
    category: string;
    near: { lat: number; lng: number };
    radiusKm: number;
    limit?: number;
  }): Promise<RawContractor[]> {
    const limit = args.limit ?? 50;
    // Seed by category + center so the same query is reproducible.
    const seed =
      hashString(args.category) ^
      Math.floor(args.near.lat * 1e4) ^
      Math.floor(args.near.lng * 1e4);
    const rand = mulberry32(seed);

    const secondWords =
      SECOND_WORDS_BY_CATEGORY[args.category] ?? [args.category];

    const out: RawContractor[] = [];
    for (let i = 0; i < limit; i++) {
      const first = pick(rand, FIRST_WORDS);
      const second = pick(rand, secondWords);
      const name = `${first} ${second}`;
      const loc = jitterLatLng(rand, args.near, args.radiusKm);

      const ratingAvg = Math.round((3 + rand() * 2) * 10) / 10;   // 3.0 – 5.0
      const ratingCount = Math.floor(20 + rand() * 480);          // 20 – 500
      const priceTier = (Math.floor(rand() * 4) + 1) as 1 | 2 | 3 | 4;
      const reviewCount = 3 + Math.floor(rand() * 6); // 3 – 8 reviews each

      out.push({
        source_id: `mock_${seed.toString(16)}_${i}`,
        name,
        phone: `+1${Math.floor(2000000000 + rand() * 7999999999)}`,
        website: `https://example.com/${first.toLowerCase().replace(/\s+/g, "-")}`,
        email: null,
        address: `${Math.floor(rand() * 9999) + 1} ${pick(rand, ["Main", "Oak", "Pine", "Maple", "Elm"])} St`,
        city: null, // resolved by caller from `near`
        state: null,
        zip: null,
        lat: loc.lat,
        lng: loc.lng,
        categories: [args.category],
        price_tier: priceTier,
        licensed_flag: rand() > 0.2,    // 80% licensed
        same_day_flag: rand() > 0.6,    // 40% same-day capable
        locally_owned: rand() > 0.4,    // 60% locally-owned
        rating_avg: ratingAvg,
        rating_count: ratingCount,
        scraped_payload: {
          adapter: "mock",
          generated_at: new Date().toISOString(),
        },
        reviews: makeReviews(rand, reviewCount),
      });
    }

    return out;
  }
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const mockAdapter = new MockAdapter();
