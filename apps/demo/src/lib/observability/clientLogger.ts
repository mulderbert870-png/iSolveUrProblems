"use client";

import type { ClientLogPayload } from "./types";

const INGEST_URL = "/api/observability/log";

let installed = false;
let currentUserId: string | null = null;

/** Called by AuthProvider after sign-in / sign-out. */
export function setClientLoggerUser(id: string | null) {
  currentUserId = id;
}

function currentRoute(): string {
  if (typeof window === "undefined") return "";
  return window.location.pathname + window.location.search;
}

/** Best-effort POST; never throws. Uses keepalive so flushes survive unload. */
async function flush(payload: ClientLogPayload) {
  if (typeof window === "undefined") return;
  // eslint-disable-next-line no-console
  console.error(`[obs:${payload.level ?? "error"}] ${payload.message}`);
  try {
    await fetch(INGEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        route: payload.route ?? currentRoute(),
        context: {
          ...(payload.context ?? {}),
          ...(currentUserId ? { client_user_id: currentUserId } : {}),
        },
      }),
      keepalive: true,
    });
  } catch {
    // Best-effort; nothing else we can do.
  }
}

/**
 * Explicit capture from app code (error boundaries, try/catch sites).
 * Returns a promise so callers can `void captureClientError(e)`.
 */
export function captureClientError(
  error: unknown,
  context?: Record<string, unknown>,
): Promise<void> {
  const err =
    error instanceof Error
      ? error
      : new Error(typeof error === "string" ? error : "unknown error");
  return flush({
    level: "error",
    message: err.message || "unknown error",
    stack: err.stack,
    context,
  });
}

/**
 * Install global handlers exactly once. Safe to call multiple times.
 * Idempotent. Mounted from AuthProvider so it runs on every page load.
 */
export function installClientLogger(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event: ErrorEvent) => {
    void flush({
      level: "error",
      message: event.message || "window.onerror",
      stack: event.error?.stack,
      context: {
        type: "window.onerror",
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });

  window.addEventListener(
    "unhandledrejection",
    (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const err =
        reason instanceof Error
          ? reason
          : new Error(typeof reason === "string" ? reason : "unhandledrejection");
      void flush({
        level: "error",
        message: err.message,
        stack: err.stack,
        context: { type: "unhandledrejection" },
      });
    },
  );
}
