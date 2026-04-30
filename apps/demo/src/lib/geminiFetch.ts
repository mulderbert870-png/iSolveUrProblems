// Shared helpers for Gemini API calls.
// Used by /api/analyze-image and /api/analyze-video routes.
// Designed to work in BOTH Vercel Edge and Node runtimes.

// Retry config for Gemini transient failures.
// 2026-04-30 — Bert hit a 503 "model experiencing high demand" between two
// successful calls of the same image. Classic transient spike. 2 retries with
// short backoff cover most spikes (~750ms total added latency worst case).
const GEMINI_MAX_ATTEMPTS = 3;
const GEMINI_RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const GEMINI_BASE_DELAY_MS = 250;

export async function fetchGeminiWithRetry(
  url: string,
  init: RequestInit,
): Promise<Response> {
  let lastResponse: Response | null = null;
  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt++) {
    const res = await fetch(url, init);
    if (res.ok || !GEMINI_RETRY_STATUSES.has(res.status)) {
      return res;
    }
    lastResponse = res;
    if (attempt < GEMINI_MAX_ATTEMPTS) {
      const delay = GEMINI_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      console.warn(
        `Gemini API ${res.status} on attempt ${attempt}/${GEMINI_MAX_ATTEMPTS}, retrying in ${delay}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  return lastResponse!;
}

// Edge-runtime-compatible ArrayBuffer -> base64. Replaces the Node-only
// `Buffer.from(buffer).toString("base64")`. Chunked to avoid call-stack
// overflow on large images (default chunk = 32KB).
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunkSize)),
    );
  }
  return btoa(binary);
}

// Returns true if the Gemini error is in the "transient overload" family.
// Used by route handlers to pick a friendlier user-facing message.
export function isGeminiOverloaded(status: number): boolean {
  return status === 429 || status === 503 || status === 504;
}
