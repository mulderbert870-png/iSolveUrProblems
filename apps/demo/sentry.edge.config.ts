/**
 * Sentry — edge runtime (middleware, edge API routes).
 *
 * Loaded by withSentryConfig. Reads SENTRY_DSN; if unset, init is a no-op.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: parseFloat(
      process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1",
    ),
    environment:
      process.env.VERCEL_ENV ??
      process.env.NODE_ENV ??
      "development",
  });
}
