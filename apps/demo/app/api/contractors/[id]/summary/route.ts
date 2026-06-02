import { NextResponse, type NextRequest } from "next/server";
import { assertAllowedOrigin } from "../../../../../src/lib/apiRouteSecurity";
import { checkRateLimit } from "../../../../../src/lib/rateLimit";
import {
  getContractorSummary,
  getContractorWithReviews,
  isSummaryStale,
  summarizeReviews,
  upsertContractorSummary,
} from "../../../../../src/lib/contractors";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/contractors/[id]/summary
 *
 * Lazy-generated review synthesis (M2.3 — Vision ¶11).
 *
 *   - Returns the cached summary if present and fresh.
 *   - If missing or stale (>30d or ≥5 new reviews), regenerates from
 *     the contractor's review corpus and caches the result.
 *   - Returns 404 if the contractor isn't in our DB.
 *   - Returns 422 if there isn't enough review signal to summarize.
 *
 * No auth required — summaries are derived from public review text and
 * are safe to surface to anonymous browsers (origin + rate-limit gate
 * the route).
 */

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    s,
  );
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const originErr = assertAllowedOrigin(request);
  if (originErr) return originErr;
  const rateLimitErr = await checkRateLimit(request);
  if (rateLimitErr) return rateLimitErr;

  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "invalid contractor id" }, { status: 400 });
  }

  let existing;
  try {
    existing = await getContractorSummary(id);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "read failed" },
      { status: 500 },
    );
  }

  let data;
  try {
    data = await getContractorWithReviews(id);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "read failed" },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json({ error: "contractor not found" }, { status: 404 });
  }

  const stale = isSummaryStale({
    existing,
    currentReviewCount: data.reviews.length,
  });

  if (existing && !stale) {
    return NextResponse.json({
      cached: true,
      summary: existing,
    });
  }

  const fresh = await summarizeReviews({
    contractorName: data.contractor.name,
    reviews: data.reviews,
  });

  if (!fresh) {
    if (existing) {
      // Generation failed; fall back to whatever's cached.
      return NextResponse.json({ cached: true, summary: existing });
    }
    return NextResponse.json(
      { error: "not enough review signal to summarize" },
      { status: 422 },
    );
  }

  try {
    await upsertContractorSummary({
      contractorId: id,
      summary: fresh,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "store failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    cached: false,
    summary: {
      ...fresh,
      contractor_id: id,
      generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  });
}
