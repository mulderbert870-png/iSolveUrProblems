import { NextResponse, type NextRequest } from "next/server";
import { assertAllowedOrigin } from "../../../../src/lib/apiRouteSecurity";
import { checkRateLimit } from "../../../../src/lib/rateLimit";
import { getUserId } from "../../../../src/lib/auth/getUser";
import { executeBook } from "../../../../src/lib/intent/bookHandler";

export const dynamic = "force-dynamic";

/**
 * POST /api/intent/book (M3.0d)
 *
 * Thin wrapper over the M3.0d book handler. Used by:
 *   - The orchestrator (in-process via the lib function executeBook)
 *   - Diagnostic tooling / curl smoke tests (this route)
 *
 * Body:
 *   {
 *     winner_id: uuid,
 *     winner_name: string,
 *     candidate_ids?: uuid[],
 *     category?: string
 *   }
 *
 * Returns: BookHandlerOutput — the PickResultPayload that would be sent
 * to the surface, plus a `used_mock` flag indicating whether real M2.6
 * was fired (post-test-drive) or the v1 mock was returned.
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

  let body: {
    winner_id?: unknown;
    winner_name?: unknown;
    candidate_ids?: unknown;
    category?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return bad("invalid JSON");
  }
  if (typeof body.winner_id !== "string" || !UUID_RE.test(body.winner_id)) {
    return bad("winner_id is required (uuid)");
  }
  if (typeof body.winner_name !== "string" || body.winner_name.trim() === "") {
    return bad("winner_name is required (string)");
  }
  const candidateIds = Array.isArray(body.candidate_ids)
    ? body.candidate_ids.filter(
        (x): x is string => typeof x === "string" && UUID_RE.test(x),
      )
    : [];

  const userId = await getUserId();
  const result = await executeBook({
    winner_id: body.winner_id,
    winner_name: body.winner_name.trim(),
    candidate_ids: candidateIds,
    user_id: userId,
    category: typeof body.category === "string" ? body.category : undefined,
  });
  return NextResponse.json(result);
}
