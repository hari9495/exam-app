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
  ])('%s goes to %s', (source, destination) => {
    expect(redirects).toContainEqual({ source, destination, permanent: false });
  });

  it('a job workspace is not redirected (it ships with AT5), and nothing still sends /jobs to the old list', () => {
    expect(redirects.some((r) => r.source.startsWith('/v2/jobs/'))).toBe(false);
    expect(redirects.some((r) => r.destination === '/v2/jobs')).toBe(false);
  });
});
