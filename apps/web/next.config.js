const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // A second dev server for end-to-end tests builds into its own folder (NEXT_DIST_DIR=.next-e2e).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // The YukthiX design system (packages/yx-ui) ships TypeScript source.
  transpilePackages: ['@yukthix/ui'],
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
  // The SSO and Google / Microsoft callbacks carry a one-time code in the fragment; nothing about it may leak onward.
  async headers() {
    return ['/sso/callback', '/yx/sign-in/callback'].map((source) => ({ source, headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] }));
  },
  async redirects() {
    const routes = ['/dashboard', '/exams', '/walk-in-groups', '/analytics/hiring', '/message-templates', '/offer-template'];
    // Decision 2398 (answers 2420-2438): each /v2 page with a YukthiX equivalent redirects there, so old bookmarks keep
    // working. Gap pages stay until their new page exists (2438). Older addresses that pointed at one of these /v2 pages
    // go straight to the new page (no double hop).
    const v2Moved = {
      '/v2/users': '/yx/settings/access',
      '/v2/audit-log': '/yx/settings/audit-log',
      // Answer 2421: system logs are staff-console only (/staff/system-logs); a company admin's old bookmark opens their audit log.
      '/v2/system-logs': '/yx/settings/audit-log',
      '/v2/data-rights': '/yx/hiring/retention',
      '/v2/settings/roles': '/yx/settings/access',
      '/v2/settings/permission-profiles': '/yx/settings/access',
      '/v2/settings/sso': '/yx/settings/identity-providers',
      '/v2/settings/billing': '/yx/settings/account/plan-and-add-ons',
      '/v2/settings/integrations': '/yx/settings/integrations/integrations',
      '/v2/settings/recycle-bin': '/yx/settings/recycle-bin',
      '/v2/calendar': '/yx/settings/integrations/calendar-and-chat',
      '/v2/today': '/yx/home',
      '/v2/exams': '/yx/hiring/assessments/tests',
      '/v2/exams/new': '/yx/hiring/assessments/tests',
      '/v2/exams/:id/edit': '/yx/hiring/assessments/tests/:id',
      '/v2/exams/:id/preview': '/yx/hiring/assessments/tests/:id',
      // A walk-in group's drives are its campus drive page; a single old drive goes to the invitations and drives list.
      '/v2/walk-in-groups': '/yx/hiring/assessments/invitations',
      '/v2/walk-in-groups/:groupId/drives': '/yx/hiring/assessments/drives/:groupId',
      '/v2/drives/:driveId': '/yx/hiring/assessments/invitations',
      '/v2/referrals': '/yx/hiring/referrals/all',
      '/v2/reports/:examId/candidates/:candidateId': '/yx/hiring/assessments/reports/:examId/:candidateId',
      '/v2/panel/reports/:examId/candidates/:candidateId': '/yx/hiring/assessments/reports/:examId/:candidateId',
      // Answer 2432: the recruiting overview and hiring analytics are Hire › Dashboard.
      '/v2/dashboard': '/yx/hiring/dashboard',
      '/v2/analytics/hiring': '/yx/hiring/dashboard',
      // Answer 2428: the weekly hiring digest is ANL-08 Report schedules.
      '/v2/settings/scheduled-reports': '/yx/hiring/schedules',
      // Answer 2437: results lists and compare: a test writer's Results tab, a reader's Test results page.
      '/v2/reports': '/yx/hiring/assessments/tests',
      '/v2/reports/:examId': '/yx/hiring/assessments/tests/:examId?tab=results',
      '/v2/reports/:examId/compare': '/yx/hiring/assessments/tests/:examId?tab=results',
      '/v2/panel/reports': '/yx/hiring/assessments/results',
      '/v2/panel/reports/:examId': '/yx/hiring/assessments/results?test=:examId',
      '/v2/panel/reports/:examId/compare': '/yx/hiring/assessments/results?test=:examId',
    };
    const direct = (r) => ({ ...r, destination: v2Moved[r.destination] ?? r.destination });
    return [
      ...Object.entries(v2Moved).map(([source, destination]) => ({ source, destination, permanent: false })),
      ...[
      // PPL-30 (founder 26 Oct 2026): My letters is part of Me › Documents and letters.
      { source: '/yx/me/letters', destination: '/yx/me/documents', permanent: false },
      // M10 AT1 / AT5 (founder D1): the jobs list and each job's workspace are YukthiX Hiring pages.
      { source: '/jobs', destination: '/yx/hiring/jobs', permanent: false },
      { source: '/v2/jobs', destination: '/yx/hiring/jobs', permanent: false },
      { source: '/v2/jobs/:jobId', destination: '/yx/hiring/jobs/:jobId', permanent: false },
      // Founder answer 345: scorecard templates moved to Settings 6.1 Hiring; the old stand-in page is gone.
      { source: '/yx/hiring/scorecards', destination: '/yx/settings/hiring', permanent: true },
      // HIR-13: internal jobs are the designed YukthiX page now; the older Internal Mobility screen is gone.
      { source: '/internal-mobility', destination: '/yx/hiring/internal-jobs', permanent: false },
      { source: '/v2/internal-mobility', destination: '/yx/hiring/internal-jobs', permanent: false },
      // M10 AT5: an interviewer's interviews and scorecards.
      { source: '/v2/panel/interviews', destination: '/yx/hiring/interviews', permanent: false },
      // M10 AT2: hiring approval routes moved to YukthiX (requisitions now run on YukthiX Approvals).
      { source: '/settings/approvals', destination: '/yx/hiring/approval-routes', permanent: false },
      { source: '/v2/settings/approvals', destination: '/yx/hiring/approval-routes', permanent: false },
      // M10 AT3: the careers site, applicant consent and job boards moved to YukthiX Hiring.
      ...['careers', 'apply-consent'].flatMap((p) => [`/settings/${p}`, `/v2/settings/${p}`].map((source) => ({ source, destination: '/yx/hiring/careers', permanent: false }))),
      ...['/settings/job-boards', '/v2/settings/job-boards'].map((source) => ({ source, destination: '/yx/hiring/job-boards', permanent: false })),
      // HIR-21 (staffing slice 2): one vendor model; the older agencies and agency-submissions pages are Hiring › Vendors.
      ...['/settings/agencies', '/v2/settings/agencies'].map((source) => ({ source, destination: '/yx/hiring/vendors', permanent: false })),
      ...['/agency-submissions', '/v2/agency-submissions'].map((source) => ({ source, destination: '/yx/hiring/vendors?tab=submissions', permanent: false })),
      // M10 AT4: the candidates list moved to YukthiX Hiring (bulk upload and invite included).
      ...['/candidates', '/v2/candidates', '/candidates/bulk-upload-invite'].map((source) => ({ source, destination: '/yx/hiring/candidates', permanent: false })),
      ...routes.map((source) => ({ source, destination: `/v2${source}`, permanent: false })),
      // The classic sign-in is retired (founder decision 7 Oct 2026): every company sign-in, password
      // reset and reset link is the YukthiX one (old bookmarks and emails included). The query string
      // carries over; a ?next= path is honoured only when it is same-site (lib/safe-next.ts).
      // YukthiX platform staff sign in at /staff/sign-in, which nothing links to.
      // T9-09 (founder decisions 8 and 10): the careers site and the candidate pages live under /yx; older emails, job
      // boards and search results still carry these addresses.
      // Founder answer 351: the API's emails and feeds use the /yx addresses since 13 Nov 2026; keep these redirects for a
      // year, until 13 Nov 2027 (older emails and boards' cached links), then remove them.
      { source: '/careers/:orgSlug', destination: '/yx/careers/:orgSlug', permanent: true },
      { source: '/careers/:orgSlug/jobs/:slug', destination: '/yx/careers/:orgSlug/jobs/:slug', permanent: true },
      { source: '/careers/:orgSlug/sitemap.xml', destination: '/yx/careers/:orgSlug/sitemap.xml', permanent: true },
      { source: '/apply/:applyToken', destination: '/yx/apply/:applyToken', permanent: true },
      { source: '/application/:statusToken', destination: '/yx/application/:statusToken', permanent: true },
      { source: '/portal/:portalToken', destination: '/yx/candidate/:portalToken', permanent: true },
      { source: '/offer/:token', destination: '/yx/offer/:token', permanent: true },
      { source: '/interview/:token', destination: '/yx/interview/:token', permanent: true },
      { source: '/login', destination: '/yx/sign-in', permanent: true },
      { source: '/v2/login', destination: '/yx/sign-in', permanent: true },
      { source: '/forgot-password', destination: '/yx/forgot-password', permanent: true },
      { source: '/reset-password/:token', destination: '/yx/reset-password/:token', permanent: true },
      // Question editor is rebuilt in v2; redirect the old editor routes too.
      // Answer 2121: the older question pages are retired; the designed question bank (Hire › Assessments) replaces them.
      { source: '/questions/new', destination: '/yx/hiring/assessments/questions/new', permanent: false },
      { source: '/questions/:id/edit', destination: '/yx/hiring/assessments/questions/:id', permanent: false },
      { source: '/questions', destination: '/yx/hiring/assessments/questions', permanent: false },
      { source: '/v2/questions', destination: '/yx/hiring/assessments/questions', permanent: false },
      { source: '/v2/questions/new', destination: '/yx/hiring/assessments/questions/new', permanent: false },
      { source: '/v2/questions/:id/edit', destination: '/yx/hiring/assessments/questions/:id', permanent: false },
      // Exam builder is rebuilt in v2. /exams/:id/preview is NOT rebuilt yet, so it stays put
      // (the v2 edit page links to the old preview route).
      { source: '/exams/new', destination: '/v2/exams/new', permanent: false },
      { source: '/exams/:id/edit', destination: '/v2/exams/:id/edit', permanent: false },
      { source: '/exams/:id/preview', destination: '/v2/exams/:id/preview', permanent: false },
      // Job detail (pipeline board) is rebuilt in v2.
      { source: '/jobs/:jobId', destination: '/yx/hiring/jobs/:jobId', permanent: false },
      // Drive detail (live board + results) is rebuilt in v2.
      { source: '/drives/:driveId', destination: '/v2/drives/:driveId', permanent: false },
      // Walk-in group drives list rebuilt in v2.
      { source: '/walk-in-groups/:groupId/drives', destination: '/v2/walk-in-groups/:groupId/drives', permanent: false },
      // Bulk upload became a modal on the v2 candidates/questions lists (no standalone route);
      // funnel the old standalone pages to those lists so no old recruiter UI stays reachable.
      { source: '/questions/bulk-upload', destination: '/yx/hiring/assessments/questions', permanent: false },
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
      { source: '/interviews', destination: '/yx/hiring/interviews', permanent: false },
      { source: '/reports', destination: '/v2/panel/reports', permanent: false },
      { source: '/reports/:examId', destination: '/v2/panel/reports/:examId', permanent: false },
      { source: '/reports/:examId/compare', destination: '/v2/panel/reports/:examId/compare', permanent: false },
      { source: '/reports/:examId/candidates/:candidateId', destination: '/v2/panel/reports/:examId/candidates/:candidateId', permanent: false },
      ].map(direct),
    ];
  },
};

// Source-map upload is gated on SENTRY_AUTH_TOKEN. A production/CI build that sets the token (plus
// SENTRY_ORG / SENTRY_PROJECT) uploads the client + server maps to Sentry so browser stack traces
// de-minify, then deletes them so the client bundle never ships source. Any build WITHOUT a token
// (local dev, and any environment where Sentry is not configured) leaves upload disabled and the
// build otherwise untouched -- same inert-until-configured stance as the DSN gating in
// instrumentation*.ts.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
module.exports = withSentryConfig(nextConfig, {
  silent: true,
  // ponytail: disable telemetry. The bundler plugin defaults telemetry to true and phones home on
  // every production build regardless of DSN configuration; silent:true only suppresses the console
  // message, not the network call.
  telemetry: false,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT || 'exam-web',
  authToken: sentryAuthToken,
  // The build sets SENTRY_RELEASE (e.g. the git SHA); the plugin injects the same value into the
  // client + server bundles so the runtime release matches the uploaded artifacts. In a Docker
  // build the .git dir is absent, so the plugin can't auto-detect a release -- set SENTRY_RELEASE
  // explicitly there. Left unset (local git build), the plugin falls back to its own detection.
  ...(process.env.SENTRY_RELEASE ? { release: { name: process.env.SENTRY_RELEASE } } : {}),
  // Upload every client bundle, not only the directly-imported ones, so every browser frame maps.
  widenClientFileUpload: true,
  sourcemaps: {
    disable: !sentryAuthToken,
    deleteSourcemapsAfterUpload: true,
  },
});
