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
  ])('%s goes to %s', (source, destination) => {
    expect(redirects).toContainEqual({ source, destination, permanent: false });
  });

  it('nothing still sends anyone to the old job pages', () => {
    expect(redirects.some((r) => r.destination.startsWith('/v2/jobs'))).toBe(false);
    expect(redirects.some((r) => r.destination === '/v2/panel/interviews')).toBe(false);
  });
});
