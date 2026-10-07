// The classic sign-in is retired (founder decision 7 Oct 2026): its routes redirect to YukthiX's.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const config = require('./next.config.js');

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
