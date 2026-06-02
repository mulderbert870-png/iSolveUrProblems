import { NextResponse, type NextRequest } from "next/server";
import { assertAllowedOrigin } from "../../../../src/lib/apiRouteSecurity";
import { checkRateLimit } from "../../../../src/lib/rateLimit";
import {
  searchContractors,
  type ContractorSearchInput,
} from "../../../../src/lib/contractors";

export const dynamic = "force-dynamic";

/**
 * POST /api/contractors/search
 *
 * Vision ¶10 — "Price? Same day service? Locally owned business?
 * 4.5 rated or higher?" — returns up to 20 ranked candidates for a
 * (category, location) target with optional preference filters.
 *
 * Body (JSON):
 *   {
 *     category: string,                              // required
 *     near:    { lat: number, lng: number },         // required
 *     radius_km?: number,                            // default 25
 *     min_rating?: number,                           // 0..5
 *     max_price_tier?: 1|2|3|4,
 *     locally_owned?: boolean,
 *     same_day?: boolean,
 *     limit?: number                                 // 1..100, default 20
 *   }
 *
 * Service-role read — RLS is locked on `contractors`; this route is the
 * sanctioned read surface.
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
  if (
    typeof body.min_rating === "number" &&
    (body.min_rating < 0 || body.min_rating > 5)
  ) {
    return badRequest("min_rating must be between 0 and 5");
  }
  if (
    typeof body.max_price_tier === "number" &&
    ![1, 2, 3, 4].includes(body.max_price_tier)
  ) {
    return badRequest("max_price_tier must be 1, 2, 3, or 4");
  }

  const result = await searchContractors({
    category: body.category.trim(),
    near: body.near,
    radius_km: body.radius_km,
    min_rating: body.min_rating,
    max_price_tier: body.max_price_tier as 1 | 2 | 3 | 4 | undefined,
    locally_owned: body.locally_owned,
    same_day: body.same_day,
    limit: body.limit,
  });

  if (result.error) {
    return NextResponse.json(
      { error: result.error, hits: [], total_considered: 0 },
      { status: 502 },
    );
  }

  return NextResponse.json({
    hits: result.hits,
    total_considered: result.total_considered,
    filters: result.filters_applied,
  });
}
