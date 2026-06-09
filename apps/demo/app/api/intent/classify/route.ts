import { NextResponse, type NextRequest } from "next/server";
import { assertAllowedOrigin } from "../../../../src/lib/apiRouteSecurity";
import { checkRateLimit } from "../../../../src/lib/rateLimit";
import { classifyIntent } from "../../../../src/lib/intent";

export const dynamic = "force-dynamic";

/**
 * POST /api/intent/classify (M3.0e)
 *
 * Standalone classifier endpoint — used for diagnostic tooling and unit
 * testing the rules without firing backend actions. The orchestrator is
 * invoked from /api/transcripts/append in the live flow; this route is
 * the inspect-without-side-effects entry point.
 *
 * Body: { text: string }
 * Returns: ClassifyResult
 */

const MAX_TEXT_CHARS = 4_000;

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

export async function POST(request: NextRequest) {
  const originErr = assertAllowedOrigin(request);
  if (originErr) return originErr;
  const rateLimitErr = await checkRateLimit(request);
  if (rateLimitErr) return rateLimitErr;

  let body: { text?: unknown };
  try {
    body = await request.json();
  } catch {
    return bad("invalid JSON");
  }
  if (
    typeof body.text !== "string" ||
    body.text.trim().length === 0 ||
    body.text.length > MAX_TEXT_CHARS
  ) {
    return bad(`text is required (string, ≤${MAX_TEXT_CHARS} chars)`);
  }
  const result = classifyIntent(body.text);
  return NextResponse.json(result);
}
