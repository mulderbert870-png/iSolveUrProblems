import { createHash } from "node:crypto";

const WINDOW_SECONDS = 60;
const DEFAULT_PER_MINUTE = 30;
const DEFAULT_PER_DAY = 300;

function getEnvInt(key: string, fallback: number): number {
  const v = process.env[key];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function currentMinuteBucket(): string {
  return new Date().toISOString().slice(0, 16); // "2026-04-19T10:25"
}

function currentDayBucket(): string {
  return new Date().toISOString().slice(0, 10); // "2026-04-19"
}

function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

async function upstashPipeline(
  commands: (string | number)[][],
): Promise<(number | null)[]> {
  const base = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!base || !token) return commands.map(() => null);

  const res = await fetch(`${base}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(commands),
  });

  if (!res.ok) return commands.map(() => null);

  const json = (await res.json()) as Array<{
    result?: number;
    error?: string;
  }>;
  return json.map((row) =>
    typeof row.result === "number" ? row.result : null,
  );
}

/**
 * Returns a 429 Response if the requesting IP has exceeded rate limits, otherwise null.
 * Skipped in non-production or if Upstash is not configured (fail open).
 * Limits: RATE_LIMIT_PER_MINUTE (default 30) and RATE_LIMIT_PER_DAY (default 300).
 */
export async function checkRateLimit(
  request: Request,
): Promise<Response | null> {
  if (process.env.NODE_ENV !== "production") return null;

  const base = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!base || !token) return null;

  const ip = getClientIp(request);
  const hashed = hashIp(ip);
  const minKey = `rl:ip:${hashed}:m:${currentMinuteBucket()}`;
  const dayKey = `rl:ip:${hashed}:d:${currentDayBucket()}`;

  const perMinute = getEnvInt("RATE_LIMIT_PER_MINUTE", DEFAULT_PER_MINUTE);
  const perDay = getEnvInt("RATE_LIMIT_PER_DAY", DEFAULT_PER_DAY);

  try {
    const results = await upstashPipeline([
      ["INCR", minKey],
      ["EXPIRE", minKey, WINDOW_SECONDS * 2],
      ["INCR", dayKey],
      ["EXPIRE", dayKey, 4 * 86400],
    ]);

    const minCount = results[0] ?? 0;
    const dayCount = results[2] ?? 0;

    if (minCount > perMinute || dayCount > perDay) {
      return new Response(JSON.stringify({ error: "Too many requests" }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(WINDOW_SECONDS),
        },
      });
    }

    return null;
  } catch {
    return null; // fail open on Redis errors
  }
}
