const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // v2 nav cutover: send the recruiter list routes to their rebuilt /v2 pages (covers login
  // landing, bookmarks, and the old shell's sidebar). Exact sources only — detail/editor
  // subpaths (/exams/:id/edit, /exams/new, /reports/:id, ...) are NOT rebuilt and stay put.
  // /reports is intentionally omitted: the 'panel' role lands there and isn't allowed in the v2
  // (recruiter) layout, so redirecting it would loop. permanent:false keeps this reversible.
  async redirects() {
    const routes = ['/dashboard', '/exams', '/questions', '/candidates', '/walk-in-groups', '/jobs', '/analytics/hiring', '/message-templates', '/offer-template'];
    return routes.map((source) => ({ source, destination: `/v2${source}`, permanent: false }));
  },
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
