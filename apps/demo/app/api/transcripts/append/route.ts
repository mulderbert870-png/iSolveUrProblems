import { NextResponse, type NextRequest } from "next/server";
import { assertAllowedOrigin } from "../../../../src/lib/apiRouteSecurity";
import { checkRateLimit } from "../../../../src/lib/rateLimit";
import { getUserId } from "../../../../src/lib/auth/getUser";
import { appendTranscript } from "../../../../src/lib/transcripts";

export const dynamic = "force-dynamic";

/**
 * POST /api/transcripts/append (M3.0c)
 *
 * Persists one finalized utterance from a live avatar session into the
 * transcripts table. The avatar SDK emits `user.transcription` +
 * `avatar.transcription` events; the client buffers per-turn and calls
 * this route on speak-ended.
 *
 * Anonymous sessions are allowed (M3.0d test drive). user_id is captured
 * server-side from the auth cookie; the client doesn't send it.
 *
 * Body:
 *   {
 *     session_id: string,        // HeyGen session id
 *     speaker:    "user" | "avatar",
 *     text:       string,        // finalized utterance
 *     context?:   {              // optional per-turn metadata
 *       turn_index?: number,
 *       prior_avatar_text?: string,
 *       ...
 *     }
 *   }
 *
 * Returns: { id: string } on success, { error } otherwise.
 *
 * Failures here MUST never block the avatar UI — the client posts
 * fire-and-forget. We still return a structured response so dev tooling
 * can diagnose.
 */

const MAX_TEXT_CHARS = 8_000;        // ~5 minutes of speech at fast cadence
const MAX_SESSION_ID_CHARS = 256;

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

export async function POST(request: NextRequest) {
  const originErr = assertAllowedOrigin(request);
  if (originErr) return originErr;
  const rateLimitErr = await checkRateLimit(request);
  if (rateLimitErr) return rateLimitErr;

  let body: {
    session_id?: unknown;
    speaker?: unknown;
    text?: unknown;
    context?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return bad("invalid JSON");
  }

  if (
    typeof body.session_id !== "string" ||
    body.session_id.length === 0 ||
    body.session_id.length > MAX_SESSION_ID_CHARS
  ) {
    return bad("session_id is required (string)");
  }
  if (body.speaker !== "user" && body.speaker !== "avatar") {
    return bad("speaker must be 'user' or 'avatar'");
  }
  if (
    typeof body.text !== "string" ||
    body.text.trim().length === 0 ||
    body.text.length > MAX_TEXT_CHARS
  ) {
    return bad("text is required (non-empty string up to 8000 chars)");
  }
  const context =
    typeof body.context === "object" && body.context !== null
      ? (body.context as Record<string, unknown>)
      : {};

  // Auth — captured server-side. Anonymous (null user_id) is allowed.
  const userId = await getUserId();

  const inserted = await appendTranscript({
    user_id: userId,
    session_id: body.session_id,
    speaker: body.speaker,
    text: body.text,
    context,
  });

  if (!inserted) {
    return NextResponse.json(
      {
        error: "Couldn't save that transcript turn. Try again.",
        debug: "appendTranscript returned null — see server logs",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ id: inserted.id });
}
