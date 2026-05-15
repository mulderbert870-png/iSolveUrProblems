import { getSupabaseAdminConfig } from "../supabaseAdmin";
import type { ErrorLogRow, LogLevel, LogRuntime } from "./types";

const MAX_MESSAGE_LEN = 4000;
const MAX_STACK_LEN = 16000;
const MAX_CONTEXT_BYTES = 32000;

function truncate(s: string | undefined | null, max: number): string | undefined {
  if (!s) return undefined;
  return s.length > max ? s.slice(0, max) : s;
}

function safeContext(
  context: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!context) return undefined;
  try {
    const json = JSON.stringify(context);
    if (json.length > MAX_CONTEXT_BYTES) {
      return { _truncated: true, _bytes: json.length };
    }
    return context;
  } catch {
    return { _unserializable: true };
  }
}

function detectEnv(): string {
  return (
    process.env.VERCEL_ENV ??
    process.env.NODE_ENV ??
    "development"
  );
}

function detectRelease(): string | undefined {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.VERCEL_DEPLOYMENT_ID ??
    undefined
  );
}

/**
 * Write a row to public.error_logs via the Supabase service-role REST
 * endpoint. Never throws — the logger swallows all internal errors and
 * falls back to console so we never break the calling code path.
 */
export async function captureServerError(row: {
  message: string;
  error?: unknown;
  level?: LogLevel;
  user_id?: string | null;
  session_id?: string | null;
  request_id?: string | null;
  route?: string | null;
  user_agent?: string | null;
  context?: Record<string, unknown>;
  runtime?: LogRuntime;
}): Promise<void> {
  const err =
    row.error instanceof Error
      ? row.error
      : row.error != null
        ? new Error(String(row.error))
        : undefined;

  const payload: ErrorLogRow = {
    level: row.level ?? "error",
    runtime: row.runtime ?? "server",
    user_id: row.user_id ?? null,
    session_id: row.session_id ?? null,
    request_id: row.request_id ?? null,
    message: truncate(err?.message ?? row.message, MAX_MESSAGE_LEN) ?? row.message,
    stack: truncate(err?.stack, MAX_STACK_LEN) ?? null,
    route: row.route ?? null,
    user_agent: row.user_agent ?? null,
    env: detectEnv(),
    release: detectRelease(),
    context: safeContext(row.context),
  };

  // Always echo to console too — so dev/Vercel logs still surface this
  // even if the Supabase write fails.
  // eslint-disable-next-line no-console
  console.error(`[obs:${payload.level}] ${payload.message}`, {
    runtime: payload.runtime,
    user_id: payload.user_id,
    session_id: payload.session_id,
    route: payload.route,
  });

  let url: string;
  let serviceRoleKey: string;
  try {
    ({ url, serviceRoleKey } = getSupabaseAdminConfig());
  } catch {
    // Supabase not configured — console echo above is all we get.
    return;
  }

  try {
    await fetch(`${url}/rest/v1/error_logs`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(payload),
      // Avoid hanging the parent response on a slow log write.
      // We don't await beyond fetch's normal lifecycle here, but
      // do not retry; logs are best-effort.
    });
  } catch (e) {
    // Swallow — logging must not throw into caller's path.
    // eslint-disable-next-line no-console
    console.error("[obs] failed to write error_logs", e);
  }
}

/** Convenience wrappers. */
export const captureServerWarn = (
  args: Parameters<typeof captureServerError>[0],
) => captureServerError({ ...args, level: "warn" });

export const captureServerInfo = (
  args: Parameters<typeof captureServerError>[0],
) => captureServerError({ ...args, level: "info" });
