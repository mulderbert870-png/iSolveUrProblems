/** Shared limits and validation for public API routes (abuse / injection hardening). */

export const MAX_OPENAI_USER_MESSAGE_CHARS = 16_000;
export const MAX_OPENAI_IMAGE_ANALYSIS_CHARS = 48_000;
export const MAX_ELEVENLABS_TEXT_CHARS = 5_000;
export const MAX_TRANSCRIPTION_TEXT_CHARS = 4_000;
export const MAX_TRANSCRIPTION_SESSION_ID_CHARS = 128;
export const MAX_ANALYZE_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_ANALYZE_IMAGE_QUESTION_CHARS = 2_000;
export const MAX_VIDEO_FRAMES = 24;
/** Max length of one base64 frame string (~1.5 MiB decoded). */
export const MAX_VIDEO_FRAME_BASE64_CHARS = 2_200_000;

const BEARER_TOKEN_MAX_LEN = 8192;

/** Reject C0 controls, DEL, and Unicode line/paragraph separators (CRLF header injection). */
function isUnsafeBearerTokenChar(code: number): boolean {
  if (code <= 0x1f || code === 0x7f) return true;
  return code === 0x2028 || code === 0x2029;
}

function bearerTokenHasUnsafeChars(t: string): boolean {
  for (let i = 0; i < t.length; i++) {
    if (isUnsafeBearerTokenChar(t.charCodeAt(i))) return true;
  }
  return false;
}

/** ElevenLabs voice id: alphanumeric, typical length ~20. */
const SAFE_VOICE_ID = /^[a-zA-Z0-9_-]{10,128}$/;

const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export function truncateUtf8String(input: string, maxChars: number): string {
  if (input.length <= maxChars) return input;
  return input.slice(0, maxChars);
}

/**
 * Returns a safe bearer token or null. Blocks CRLF/control chars and oversized values;
 * allows any other characters (JWT, opaque ASCII, or Unicode) that APIs may issue.
 */
export function parseSafeBearerToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!t || t.length > BEARER_TOKEN_MAX_LEN) return null;
  if (bearerTokenHasUnsafeChars(t)) return null;
  return t;
}

/**
 * Validates `Authorization: Bearer <token>` and returns the token, or null.
 */
export function sessionTokenFromRequestAuthHeader(
  authHeader: string | null,
): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return parseSafeBearerToken(authHeader.slice(7));
}

/** Rebuild header so only a validated token is forwarded upstream. */
export function authorizationBearerHeader(token: string): string {
  return `Bearer ${token}`;
}

export function isAllowedImageMime(mime: string): boolean {
  const m = mime.split(";")[0]?.trim().toLowerCase() || "";
  return ALLOWED_IMAGE_MIMES.has(m);
}

export function isSafeElevenLabsVoiceId(voiceId: unknown): voiceId is string {
  return typeof voiceId === "string" && SAFE_VOICE_ID.test(voiceId);
}

const BASE64_CHUNK = /^[A-Za-z0-9+/]*={0,2}$/;
const SAFE_TRANSCRIPTION_SESSION_ID = /^[a-zA-Z0-9_-]{8,128}$/;

export function isReasonableBase64Frame(s: unknown): s is string {
  if (typeof s !== "string" || s.length === 0) return false;
  if (s.length > MAX_VIDEO_FRAME_BASE64_CHARS) return false;
  if (s.length % 4 !== 0) return false;
  return BASE64_CHUNK.test(s);
}

export function isSafeTranscriptionSessionId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (v.length < 8 || v.length > MAX_TRANSCRIPTION_SESSION_ID_CHARS) {
    return false;
  }
  return SAFE_TRANSCRIPTION_SESSION_ID.test(v);
}
