const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
};

// ponytail: no auth token is configured, so the Sentry build plugin can't
// upload source maps anyway -- `sourcemaps.disable` makes that explicit
// instead of relying on the absence of a token.
module.exports = withSentryConfig(nextConfig, {
  silent: true,
  sourcemaps: {
    disable: true,
  },
});
