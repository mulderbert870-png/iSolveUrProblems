import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

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
// SENTRY_AUTH_TOKEN is unset (build stays green).
const sentryWebpackPluginOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  disableServerWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,
  disableClientWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,
};

// Plugin composition: next-intl plugin first (transforms i18n imports),
// then Sentry wraps the result for instrumentation + source maps.
export default withSentryConfig(withNextIntl(nextConfig), sentryWebpackPluginOptions);
