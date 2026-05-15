/**
 * Sentry — browser runtime.
 *
 * Loaded automatically by withSentryConfig on every page in the client
 * bundle. Reads NEXT_PUBLIC_SENTRY_DSN at build time; if unset the init
 * is a no-op so missing config never breaks the app.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: parseFloat(
      process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0.1",
    ),
    replaysSessionSampleRate: parseFloat(
      process.env.NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE ?? "0",
    ),
    replaysOnErrorSampleRate: parseFloat(
      process.env.NEXT_PUBLIC_SENTRY_REPLAYS_ERROR_SAMPLE_RATE ?? "1",
    ),
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
    // Light defaults; opt into session replay only when DSN is set so we
    // never burn quota on local dev unless explicitly configured.
    integrations:
      process.env.NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE === undefined &&
      process.env.NEXT_PUBLIC_SENTRY_REPLAYS_ERROR_SAMPLE_RATE === undefined
        ? []
        : [Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true })],
  });
}
