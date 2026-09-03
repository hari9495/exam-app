const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  experimental: {
    // Next 16 splits 404 handling: app/not-found.tsx only renders for notFound()
    // calls inside a MATCHED route, while a completely unmatched URL (a typo'd
    // link, a stale bookmark) falls back to Next's own unstyled "This page could
    // not be found". This flag routes those to app/global-not-found.tsx so a bad
    // URL lands on the branded page instead.
    globalNotFound: true,
  },
  // v2 nav cutover: send the recruiter list routes to their rebuilt /v2 pages (covers login
  // landing, bookmarks, and the old shell's sidebar). Exact sources only — detail/editor
  // subpaths (/exams/:id/edit, /exams/new, /reports/:id, ...) are NOT rebuilt and stay put.
  // Every staff console is now v2 (recruiter/org-admin/platform/panel); the blocks below redirect
  // each console's routes to /v2. /reports now targets the dedicated /v2/panel/reports (its own
  // path, which admits the panel role), which resolves the old redirect loop. permanent:false keeps
  // this reversible.
  async redirects() {
    const routes = ['/dashboard', '/exams', '/questions', '/candidates', '/walk-in-groups', '/jobs', '/analytics/hiring', '/message-templates', '/offer-template'];
    return [
      ...routes.map((source) => ({ source, destination: `/v2${source}`, permanent: false })),
      // Staff login is rebuilt in v2 (Azure split login). Everything that pushes to /login
      // (logout, unauth guards, SSO/reset returns) funnels to the v2 page. permanent:false → reversible.
      { source: '/login', destination: '/v2/login', permanent: false },
      // Question editor is rebuilt in v2; redirect the old editor routes too.
      { source: '/questions/new', destination: '/v2/questions/new', permanent: false },
      { source: '/questions/:id/edit', destination: '/v2/questions/:id/edit', permanent: false },
      // Exam builder is rebuilt in v2. /exams/:id/preview is NOT rebuilt yet, so it stays put
      // (the v2 edit page links to the old preview route).
      { source: '/exams/new', destination: '/v2/exams/new', permanent: false },
      { source: '/exams/:id/edit', destination: '/v2/exams/:id/edit', permanent: false },
      { source: '/exams/:id/preview', destination: '/v2/exams/:id/preview', permanent: false },
      // Job detail (pipeline board) is rebuilt in v2.
      { source: '/jobs/:jobId', destination: '/v2/jobs/:jobId', permanent: false },
      // Drive detail (live board + results) is rebuilt in v2.
      { source: '/drives/:driveId', destination: '/v2/drives/:driveId', permanent: false },
      // Walk-in group drives list rebuilt in v2.
      { source: '/walk-in-groups/:groupId/drives', destination: '/v2/walk-in-groups/:groupId/drives', permanent: false },
      // Bulk upload became a modal on the v2 candidates/questions lists (no standalone route);
      // funnel the old standalone pages to those lists so no old recruiter UI stays reachable.
      { source: '/questions/bulk-upload', destination: '/v2/questions', permanent: false },
      { source: '/candidates/bulk-upload-invite', destination: '/v2/candidates', permanent: false },
      // v2 cutover — org-admin console (settings + admin surfaces).
      { source: '/settings/billing', destination: '/v2/settings/billing', permanent: false },
      { source: '/settings/integrations', destination: '/v2/settings/integrations', permanent: false },
      { source: '/settings/branding', destination: '/v2/settings/branding', permanent: false },
      { source: '/settings/sso', destination: '/v2/settings/sso', permanent: false },
      { source: '/users', destination: '/v2/users', permanent: false },
      { source: '/audit-log', destination: '/v2/audit-log', permanent: false },
      { source: '/system-logs', destination: '/v2/system-logs', permanent: false },
      { source: '/data-rights', destination: '/v2/data-rights', permanent: false },
      // v2 cutover — platform (super-admin) console.
      { source: '/organizations', destination: '/v2/organizations', permanent: false },
      { source: '/plans', destination: '/v2/plans', permanent: false },
      { source: '/platform-admins', destination: '/v2/platform-admins', permanent: false },
      { source: '/all-users', destination: '/v2/all-users', permanent: false },
      // v2 cutover — panel/interviewer console (/v2/panel/* is a real path, so /reports redirects
      // here without the old loop). Each report depth is listed explicitly (:param = one segment).
      { source: '/interviews', destination: '/v2/panel/interviews', permanent: false },
      { source: '/reports', destination: '/v2/panel/reports', permanent: false },
      { source: '/reports/:examId', destination: '/v2/panel/reports/:examId', permanent: false },
      { source: '/reports/:examId/compare', destination: '/v2/panel/reports/:examId/compare', permanent: false },
      { source: '/reports/:examId/candidates/:candidateId', destination: '/v2/panel/reports/:examId/candidates/:candidateId', permanent: false },
    ];
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
