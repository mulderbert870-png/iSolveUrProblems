import { NextResponse, type NextRequest } from "next/server";
import { assertAllowedOrigin } from "../../../../src/lib/apiRouteSecurity";
import { checkRateLimit } from "../../../../src/lib/rateLimit";
import { getUserId } from "../../../../src/lib/auth/getUser";
import {
  runPickFanOut,
  searchContractors,
} from "../../../../src/lib/contractors";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/contractors/pick
 *
 * M2.6 — simulates the contract-pick trigger that M2.5 will fire when a
 * homeowner accepts an estimate. Fan-outs:
 *   - contractor.win.v1 → the chosen contractor
 *   - contractor.lose.v1 → every other candidate (with LLM feedback)
 *
 * Auth: signed-in user only (we don't want anonymous traffic kicking
 * vendor calls).
 *
 * Body:
 *   {
 *     winner_id: uuid,                    // required
 *     // Either pass candidate_ids explicitly:
 *     candidate_ids?: uuid[],
 *     // OR a search target so we re-derive the candidate set server-side:
 *     search?: {
 *       category: string,
 *       near: { lat: number, lng: number },
 *       radius_km?: number,
 *       min_rating?: number,
 *       max_price_tier?: 1|2|3|4,
 *       locally_owned?: boolean,
 *       same_day?: boolean
 *     },
 *     category: string,                   // required (template copy)
 *     homeowner_location?: string,        // optional
 *     project_url?: string                // optional
 *   }
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

export async function POST(request: NextRequest) {
  const originErr = assertAllowedOrigin(request);
  if (originErr) return originErr;
  const rateLimitErr = await checkRateLimit(request);
  if (rateLimitErr) return rateLimitErr;

  const userId = await getUserId();
  if (!userId) return bad("sign-in required", 401);

  let body: {
    winner_id?: unknown;
    candidate_ids?: unknown;
    search?: unknown;
    category?: unknown;
    homeowner_location?: unknown;
    project_url?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return bad("invalid JSON");
  }

  if (typeof body.winner_id !== "string" || !UUID_RE.test(body.winner_id)) {
    return bad("winner_id is required (uuid)");
  }
  if (typeof body.category !== "string" || body.category.trim() === "") {
    return bad("category is required");
  }
  const category = body.category.trim();
  const homeownerLocation =
    typeof body.homeowner_location === "string"
      ? body.homeowner_location
      : null;
  const projectUrl =
    typeof body.project_url === "string" ? body.project_url : null;

  // Resolve the candidate set: prefer explicit list; else re-run search.
  let candidateIds: string[];
  if (Array.isArray(body.candidate_ids)) {
    candidateIds = body.candidate_ids
      .filter((x): x is string => typeof x === "string" && UUID_RE.test(x))
      .slice(0, 50);
  } else if (
    typeof body.search === "object" &&
    body.search !== null
  ) {
    const s = body.search as Record<string, unknown>;
    if (
      typeof s.category !== "string" ||
      typeof s.near !== "object" ||
      s.near === null ||
      typeof (s.near as { lat?: unknown }).lat !== "number" ||
      typeof (s.near as { lng?: unknown }).lng !== "number"
    ) {
      return bad("search.category and search.near are required");
    }
    const searchRes = await searchContractors({
      category: s.category,
      near: s.near as { lat: number; lng: number },
      radius_km: typeof s.radius_km === "number" ? s.radius_km : undefined,
      min_rating: typeof s.min_rating === "number" ? s.min_rating : undefined,
      max_price_tier:
        typeof s.max_price_tier === "number"
          ? (s.max_price_tier as 1 | 2 | 3 | 4)
          : undefined,
      locally_owned:
        typeof s.locally_owned === "boolean" ? s.locally_owned : undefined,
      same_day: typeof s.same_day === "boolean" ? s.same_day : undefined,
      limit: 50,
    });
    if (searchRes.error) {
      return bad(searchRes.error, 502);
    }
    candidateIds = searchRes.hits.map((h) => h.id);
  } else {
    return bad("either candidate_ids or search is required");
  }

  if (!candidateIds.includes(body.winner_id)) {
    candidateIds = [body.winner_id, ...candidateIds];
  }

  const output = await runPickFanOut({
    winnerId: body.winner_id,
    candidateIds,
    category,
    homeownerLocation,
    projectUrl,
    userPreferences: [],
    context: {
      simulation: true,
      triggered_by_user_id: userId,
    },
  });

  return NextResponse.json(output);
}
