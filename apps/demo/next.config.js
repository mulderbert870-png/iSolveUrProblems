/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@heygen/liveavatar-web-sdk'],
  eslint: {
    // Avoid build failure when repo has eslint.config.js importing missing @repo/eslint-config
    ignoreDuringBuilds: true,
  },
  experimental: {
    // Allow larger request bodies when proxy is used (e.g. for /api/analyze-image uploads)
    proxyClientMaxBodySize: '10mb',
  },
};

export default nextConfig;
