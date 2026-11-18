// The classic sign-in is retired (founder decision 7 Oct 2026): its routes redirect to YukthiX's.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const config = require('./next.config.js');

export {}; // a module, so `config` doesn't clash with other test files' globals

type Redirect = { source: string; destination: string; permanent: boolean };

describe('classic sign-in redirects', () => {
  let redirects: Redirect[];
  beforeAll(async () => {
    redirects = await config.redirects();
  });

  it.each([
    ['/login', '/yx/sign-in'],
    ['/v2/login', '/yx/sign-in'],
    ['/forgot-password', '/yx/forgot-password'],
    ['/reset-password/:token', '/yx/reset-password/:token'],
  ])('%s goes to %s for good', (source, destination) => {
    expect(redirects).toContainEqual({ source, destination, permanent: true });
  });

  it('never points anything at a classic sign-in page, and never at the staff page', () => {
    for (const r of redirects) expect(r.destination).not.toMatch(/^\/(v2\/)?login|^\/(forgot|reset)-password|^\/staff/);
  });
});

// M10 AT1 (founder D1): a v2 hiring page is retired with a redirect once its YukthiX screen ships.
describe('hiring pages moved to YukthiX', () => {
  let redirects: Redirect[];
  beforeAll(async () => {
    redirects = await config.redirects();
  });

  it.each([
    ['/v2/jobs', '/yx/hiring/jobs'],
    ['/jobs', '/yx/hiring/jobs'],
    ['/v2/settings/approvals', '/yx/hiring/approval-routes'],
    ['/settings/approvals', '/yx/hiring/approval-routes'],
    ['/v2/settings/careers', '/yx/hiring/careers'],
    ['/settings/careers', '/yx/hiring/careers'],
    ['/v2/settings/apply-consent', '/yx/hiring/careers'],
    ['/settings/apply-consent', '/yx/hiring/careers'],
    ['/v2/settings/job-boards', '/yx/hiring/job-boards'],
    ['/settings/job-boards', '/yx/hiring/job-boards'],
    ['/v2/candidates', '/yx/hiring/candidates'],
    ['/candidates', '/yx/hiring/candidates'],
    ['/candidates/bulk-upload-invite', '/yx/hiring/candidates'],
    ['/v2/jobs/:jobId', '/yx/hiring/jobs/:jobId'],
    ['/jobs/:jobId', '/yx/hiring/jobs/:jobId'],
    ['/v2/panel/interviews', '/yx/hiring/interviews'],
    ['/interviews', '/yx/hiring/interviews'],
    ['/v2/settings/agencies', '/yx/hiring/vendors'],
    ['/settings/agencies', '/yx/hiring/vendors'],
    ['/v2/agency-submissions', '/yx/hiring/vendors?tab=submissions'],
    ['/agency-submissions', '/yx/hiring/vendors?tab=submissions'],
    // Answer 2121: the older question pages go to the designed question bank.
    ['/v2/questions', '/yx/hiring/assessments/questions'],
    ['/questions', '/yx/hiring/assessments/questions'],
    ['/v2/questions/new', '/yx/hiring/assessments/questions/new'],
    ['/questions/new', '/yx/hiring/assessments/questions/new'],
    ['/v2/questions/:id/edit', '/yx/hiring/assessments/questions/:id'],
    ['/questions/:id/edit', '/yx/hiring/assessments/questions/:id'],
    ['/questions/bulk-upload', '/yx/hiring/assessments/questions'],
  ])('%s goes to %s', (source, destination) => {
    expect(redirects).toContainEqual({ source, destination, permanent: false });
  });

  it('nothing still sends anyone to the old job pages', () => {
    expect(redirects.some((r) => r.destination.startsWith('/v2/jobs'))).toBe(false);
    expect(redirects.some((r) => r.destination === '/v2/panel/interviews')).toBe(false);
    expect(redirects.some((r) => r.destination.startsWith('/v2/questions'))).toBe(false);
  });
});

// PPL-30 (founder 26 Oct 2026): old My letters links and bookmarks open Me › Documents and letters.
it('/yx/me/letters goes to Documents and letters', async () => {
  expect(await config.redirects()).toContainEqual({ source: '/yx/me/letters', destination: '/yx/me/documents', permanent: false });
});

// Founder answer 345: the scorecard templates stand-in is gone; its old address opens Settings 6.1 Hiring.
describe('scorecard templates moved to Settings 6.1', () => {
  it('/yx/hiring/scorecards goes to /yx/settings/hiring for good', async () => {
    expect(await config.redirects()).toContainEqual({ source: '/yx/hiring/scorecards', destination: '/yx/settings/hiring', permanent: true });
  });
});

// Decision 2398 (answers 2420-2438): /v2 pages with a YukthiX equivalent redirect there; gap pages stay until built.
describe('retiring /v2: old bookmarks reach the new pages', () => {
  let redirects: Redirect[];
  beforeAll(async () => {
    redirects = await config.redirects();
  });

  it.each([
    ['/v2/users', '/yx/settings/access'],
    ['/v2/audit-log', '/yx/settings/audit-log'],
    ['/v2/data-rights', '/yx/hiring/retention'],
    ['/v2/settings/roles', '/yx/settings/access'],
    ['/v2/settings/permission-profiles', '/yx/settings/access'],
    ['/v2/settings/sso', '/yx/settings/identity-providers'],
    ['/v2/today', '/yx/home'],
    ['/v2/exams', '/yx/hiring/assessments/tests'],
    ['/v2/exams/:id/edit', '/yx/hiring/assessments/tests/:id'],
    ['/v2/exams/:id/preview', '/yx/hiring/assessments/tests/:id'],
    ['/v2/walk-in-groups/:groupId/drives', '/yx/hiring/assessments/drives/:groupId'],
    ['/v2/referrals', '/yx/hiring/referrals/all'],
    ['/v2/panel/reports/:examId/candidates/:candidateId', '/yx/hiring/assessments/reports/:examId/:candidateId'],
    ['/users', '/yx/settings/access'],
    ['/exams/:id/edit', '/yx/hiring/assessments/tests/:id'],
    ['/reports/:examId/candidates/:candidateId', '/yx/hiring/assessments/reports/:examId/:candidateId'],
    ['/v2/reports/:examId', '/yx/hiring/assessments/tests/:examId?tab=results'],
    ['/v2/dashboard', '/yx/hiring/dashboard'],
    ['/dashboard', '/yx/hiring/dashboard'],
    ['/analytics/hiring', '/yx/hiring/dashboard'],
    ['/v2/panel/reports', '/yx/hiring/assessments/results'],
    ['/v2/panel/reports/:examId/compare', '/yx/hiring/assessments/results?test=:examId'],
    ['/reports', '/yx/hiring/assessments/results'],
    ['/reports/:examId', '/yx/hiring/assessments/results?test=:examId'],
  ])('%s goes to %s', (source, destination) => {
    expect(redirects).toContainEqual({ source, destination, permanent: false });
  });

  it('never chains: no destination is itself redirected, and each source is listed once', () => {
    const sources = redirects.map((r) => r.source);
    expect(new Set(sources).size).toBe(sources.length);
    for (const r of redirects) expect(sources).not.toContain(r.destination.split('?')[0]);
  });

  it('gap pages stay (2438): their addresses are not redirected away yet', () => {
    for (const gap of ['/v2/surveys', '/v2/system-logs', '/v2/settings/branding'])
      expect(redirects.some((r) => r.source === gap)).toBe(false);
  });
});
