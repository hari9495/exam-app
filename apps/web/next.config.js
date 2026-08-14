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
  // ponytail: disable telemetry. The bundler plugin defaults telemetry to true
  // and phones home on every production build regardless of DSN configuration;
  // silent:true only suppresses the console message, not the network call.
  telemetry: false,
  sourcemaps: {
    disable: true,
  },
});
