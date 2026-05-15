import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@heygen/liveavatar-web-sdk"],
  eslint: {
    // Avoid build failure when repo has eslint.config.js importing missing @repo/eslint-config
    ignoreDuringBuilds: true,
  },
  experimental: {
    // Allow larger request bodies when proxy is used (e.g. for /api/analyze-image uploads)
    proxyClientMaxBodySize: "10mb",
  },
};

// withSentryConfig adds source-map upload + auto-instrumentation. It's a
// no-op at runtime when SENTRY_DSN is unset; source-map upload skips when
// SENTRY_AUTH_TOKEN is unset (build still succeeds).
const sentryWebpackPluginOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  disableServerWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,
  disableClientWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,
};

export default withSentryConfig(nextConfig, sentryWebpackPluginOptions);
