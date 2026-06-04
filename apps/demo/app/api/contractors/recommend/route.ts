import { NextResponse, type NextRequest } from "next/server";
import { assertAllowedOrigin } from "../../../../src/lib/apiRouteSecurity";
import { checkRateLimit } from "../../../../src/lib/rateLimit";
import { getUserId } from "../../../../src/lib/auth/getUser";
import {
  recommendContractors,
  type ContractorSearchInput,
} from "../../../../src/lib/contractors";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/contractors/recommend
 *
 * Vision ¶11 — "make recommendations on which contractors he prefers".
 * Same input shape as /api/contractors/search; output is 3 ranked picks
 * with a 1-line natural-language reason per pick. Personalization uses
 * the signed-in user's stored preferences (M1.2 memory facts) if any.
 */

function badRequest(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const originErr = assertAllowedOrigin(request);
  if (originErr) return originErr;
  const rateLimitErr = await checkRateLimit(request);
  if (rateLimitErr) return rateLimitErr;

  let body: Partial<ContractorSearchInput>;
  try {
    body = (await request.json()) as Partial<ContractorSearchInput>;
  } catch {
    return badRequest("invalid JSON");
  }

  if (typeof body.category !== "string" || !body.category.trim()) {
    return badRequest("category is required");
  }
  if (
    typeof body.near !== "object" ||
    body.near === null ||
    typeof body.near.lat !== "number" ||
    typeof body.near.lng !== "number"
  ) {
    return badRequest("near.lat and near.lng are required numbers");
  }

  const userId = await getUserId();
  const result = await recommendContractors({
    userId,
    searchInput: {
      category: body.category.trim(),
      near: body.near,
      radius_km: body.radius_km,
      min_rating: body.min_rating,
      max_price_tier: body.max_price_tier as 1 | 2 | 3 | 4 | undefined,
      locally_owned: body.locally_owned,
      same_day: body.same_day,
    },
  });

  if (result.error) {
    return NextResponse.json(
      {
        error: result.error,
        picks: [],
        considered: 0,
        preference_facts: result.preference_facts,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    picks: result.picks,
    considered: result.considered,
    preference_facts: result.preference_facts,
  });
}
