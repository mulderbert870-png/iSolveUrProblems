import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_SECRET } from "../../../secrets";
import {
  refreshContractors,
  type RefreshResult,
} from "../../../../../src/lib/contractors";
import type { ContractorCategorySlug } from "../../../../../src/lib/contractors/types";
import { verifyAdminBearer } from "../../../../../src/lib/apiRouteSecurity";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/admin/contractors/seed
 *
 * Triggers a contractor refresh for a (categories, center, radius) target.
 * Defaults seed mock data centered on Austin, TX — easy to demo without
 * SG Dietz unblocking the real data source.
 *
 * Auth: bearer token must match ADMIN_SECRET env var. If ADMIN_SECRET is
 * unset (early dev) the route is unconditionally locked (503).
 *
 * Body (all optional):
 *   {
 *     categories?: string[],     // default: all 15
 *     near?: { lat, lng },       // default: Austin downtown
 *     radius_km?: number,        // default: 25
 *     per_category?: number,     // default: 50
 *   }
 *
 * Response:
 *   { ok: true, results: RefreshResult[] }
 */

const ALL_CATEGORIES: ContractorCategorySlug[] = [
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

const DEFAULT_CENTER = { lat: 30.2672, lng: -97.7431 }; // Austin, TX
const DEFAULT_RADIUS_KM = 25;
const DEFAULT_PER_CATEGORY = 50;

export async function POST(request: NextRequest) {
  if (!ADMIN_SECRET) {
    return NextResponse.json(
      { error: "ADMIN_SECRET not configured" },
      { status: 503 },
    );
  }
  if (!verifyAdminBearer(request.headers.get("authorization"), ADMIN_SECRET).ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    categories?: unknown;
    near?: unknown;
    radius_km?: unknown;
    per_category?: unknown;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    // empty body is fine
  }

  const categories =
    Array.isArray(body.categories) && body.categories.length > 0
      ? (body.categories as string[]).filter(
          (c): c is ContractorCategorySlug =>
            (ALL_CATEGORIES as readonly string[]).includes(c),
        )
      : ALL_CATEGORIES;

  const near =
    typeof body.near === "object" &&
    body.near !== null &&
    typeof (body.near as { lat?: unknown }).lat === "number" &&
    typeof (body.near as { lng?: unknown }).lng === "number"
      ? (body.near as { lat: number; lng: number })
      : DEFAULT_CENTER;

  const radiusKm =
    typeof body.radius_km === "number" && body.radius_km > 0
      ? Math.min(body.radius_km, 200)
      : DEFAULT_RADIUS_KM;

  const perCategory =
    typeof body.per_category === "number" && body.per_category > 0
      ? Math.min(Math.floor(body.per_category), 200)
      : DEFAULT_PER_CATEGORY;

  // Run sequentially to avoid blasting the DB with N parallel writes.
  // For mock data this is microseconds; for real adapters we'd add
  // proper rate limiting per source.
  const results: RefreshResult[] = [];
  for (const category of categories) {
    const r = await refreshContractors({
      category,
      near,
      radiusKm,
      limit: perCategory,
    });
    results.push(r);
  }

  const totalContractors = results.reduce(
    (sum, r) => sum + r.upserted_contractors,
    0,
  );
  const totalReviews = results.reduce((sum, r) => sum + r.upserted_reviews, 0);

  return NextResponse.json({
    ok: true,
    source: results[0]?.source ?? "n/a",
    near,
    radius_km: radiusKm,
    total_contractors: totalContractors,
    total_reviews: totalReviews,
    results,
  });
}
