import {
  searchContractors,
  type ContractorSearchHit,
} from "./search";
import {
  recommendContractors,
  type RecommendationPick,
} from "./recommend";
import type { ContractorCategorySlug } from "./types";

/**
 * OpenAI function-calling tool spec for the contractor search.
 * Vision ¶8 + ¶10 — 6 sources contractors and ranks by preferences
 * (price, locality, same-day, rating). Used by openai-chat-complete.
 */

const CATEGORY_SLUGS: ContractorCategorySlug[] = [
  "plumber",
  "electrician",
  "hvac",
  "roofer",
  "landscaper",
  "painter",
  "handyman",
  "general",
  "carpenter",
  "flooring",
  "appliance",
  "cleaning",
  "pest",
  "garage_door",
  "window",
];

export const SEARCH_CONTRACTORS_TOOL = {
  type: "function" as const,
  function: {
    name: "search_contractors",
    description:
      "Find local contractors (plumber, electrician, roofer, etc.) ranked by rating + distance with optional preference filters. Use this whenever the user wants help finding a service professional. If you don't already know the user's lat/lng but they mentioned a city or ZIP, supply approximate coordinates for that city/ZIP. If you have neither, ask the user where they are before calling.",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: CATEGORY_SLUGS,
          description: "Type of contractor to search for.",
        },
        near_lat: {
          type: "number",
          description: "Latitude of the user (decimal degrees).",
        },
        near_lng: {
          type: "number",
          description: "Longitude of the user (decimal degrees).",
        },
        radius_km: {
          type: "number",
          description: "Search radius in km. Default 25.",
        },
        min_rating: {
          type: "number",
          description:
            "Minimum rating on a 0–5 scale. Per vision ¶10 default to 4.5 when the user implies they want quality.",
        },
        max_price_tier: {
          type: "integer",
          enum: [1, 2, 3, 4],
          description:
            "Cap on price tier (1=$ cheapest, 4=$$$$ most expensive).",
        },
        locally_owned: {
          type: "boolean",
          description: "Filter to locally-owned businesses only.",
        },
        same_day: {
          type: "boolean",
          description: "Filter to contractors offering same-day service.",
        },
      },
      required: ["category", "near_lat", "near_lng"],
      additionalProperties: false,
    },
  },
};

export type SearchContractorsArgs = {
  category: string;
  near_lat: number;
  near_lng: number;
  radius_km?: number;
  min_rating?: number;
  max_price_tier?: 1 | 2 | 3 | 4;
  locally_owned?: boolean;
  same_day?: boolean;
};

export type ContractorChatHit = {
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
};

export type ContractorChatResult = {
  ok: boolean;
  category: string;
  count: number;
  hits: ContractorChatHit[];
  deep_link: string;
  error?: string;
};

function toChatHit(h: ContractorSearchHit): ContractorChatHit {
  return {
    id: h.id,
    name: h.name,
    rating_avg: h.rating_avg,
    rating_count: h.rating_count,
    distance_km: Number(h.distance_km.toFixed(2)),
    price_tier: h.price_tier,
    locally_owned: h.locally_owned,
    same_day_flag: h.same_day_flag,
    licensed_flag: h.licensed_flag,
    phone: h.phone,
    website: h.website,
  };
}

function buildDeepLink(locale: string, args: SearchContractorsArgs): string {
  const path = locale === "en" ? "/contractors" : `/${locale}/contractors`;
  const params = new URLSearchParams();
  params.set("category", args.category);
  // The page reads only `category` today; extra params are forward-compat.
  if (args.min_rating != null) params.set("min_rating", String(args.min_rating));
  if (args.max_price_tier != null)
    params.set("max_price_tier", String(args.max_price_tier));
  if (args.locally_owned) params.set("locally_owned", "1");
  if (args.same_day) params.set("same_day", "1");
  return `${path}?${params.toString()}`;
}

export const RECOMMEND_CONTRACTORS_TOOL = {
  type: "function" as const,
  function: {
    name: "recommend_contractors",
    description:
      "Pick the homeowner's top 3 contractor matches with a 1-line reason each. Use this when the user is choosing — phrases like 'which one should I pick', 'who do you recommend', 'help me decide'. Uses the same inputs as search_contractors and folds in the user's stored preferences. Prefer this over search_contractors when the user asks for a recommendation rather than a list.",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: CATEGORY_SLUGS,
          description: "Type of contractor.",
        },
        near_lat: { type: "number" },
        near_lng: { type: "number" },
        radius_km: { type: "number" },
        min_rating: { type: "number" },
        max_price_tier: { type: "integer", enum: [1, 2, 3, 4] },
        locally_owned: { type: "boolean" },
        same_day: { type: "boolean" },
      },
      required: ["category", "near_lat", "near_lng"],
      additionalProperties: false,
    },
  },
};

export type ContractorChatRecommendation = {
  contractor_id: string;
  name: string;
  rating_avg: number | null;
  rating_count: number | null;
  distance_km: number;
  price_tier: number | null;
  reason: string;
};

export type ContractorChatRecommendResult = {
  ok: boolean;
  category: string;
  picks: ContractorChatRecommendation[];
  preference_facts: string[];
  deep_link: string;
  error?: string;
};

function toChatRecommendation(p: RecommendationPick): ContractorChatRecommendation {
  return {
    contractor_id: p.contractor_id,
    name: p.name,
    rating_avg: p.rating_avg,
    rating_count: p.rating_count,
    distance_km: p.distance_km,
    price_tier: p.price_tier,
    reason: p.reason,
  };
}

export async function runRecommendContractorsTool(args: {
  toolArgs: SearchContractorsArgs;
  userId: string | null;
  locale: string;
}): Promise<ContractorChatRecommendResult> {
  const { toolArgs, userId, locale } = args;
  const result = await recommendContractors({
    userId,
    searchInput: {
      category: toolArgs.category,
      near: { lat: toolArgs.near_lat, lng: toolArgs.near_lng },
      radius_km: toolArgs.radius_km,
      min_rating: toolArgs.min_rating,
      max_price_tier: toolArgs.max_price_tier,
      locally_owned: toolArgs.locally_owned,
      same_day: toolArgs.same_day,
    },
  });

  if (result.error) {
    return {
      ok: false,
      category: toolArgs.category,
      picks: [],
      preference_facts: result.preference_facts,
      deep_link: buildDeepLink(locale, toolArgs),
      error: result.error,
    };
  }

  return {
    ok: true,
    category: toolArgs.category,
    picks: result.picks.map(toChatRecommendation),
    preference_facts: result.preference_facts,
    deep_link: buildDeepLink(locale, toolArgs),
  };
}

export async function runSearchContractorsTool(
  args: SearchContractorsArgs,
  locale: string,
): Promise<ContractorChatResult> {
  const result = await searchContractors({
    category: args.category,
    near: { lat: args.near_lat, lng: args.near_lng },
    radius_km: args.radius_km,
    min_rating: args.min_rating,
    max_price_tier: args.max_price_tier,
    locally_owned: args.locally_owned,
    same_day: args.same_day,
    limit: 5,
  });

  if (result.error) {
    return {
      ok: false,
      category: args.category,
      count: 0,
      hits: [],
      deep_link: buildDeepLink(locale, args),
      error: result.error,
    };
  }

  return {
    ok: true,
    category: args.category,
    count: result.hits.length,
    hits: result.hits.map(toChatHit),
    deep_link: buildDeepLink(locale, args),
  };
}
