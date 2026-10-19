import { landingFor } from './yx-landing';

describe('landingFor (where a YukthiX sign-in lands)', () => {
  it('everyone lands on the YukthiX Home, recruiters and interviewers too (founder, 19 Oct 2026)', () => {
    expect(landingFor('recruiter')).toBe('/yx/home');
    expect(landingFor('panel')).toBe('/yx/home');
    expect(landingFor('org_admin')).toBe('/yx/home');
    expect(landingFor(undefined)).toBe('/yx/home');
  });

  it("a new hire in their first 30 days lands on that page; platform staff keep their console", () => {
    expect(landingFor('panel', true)).toBe('/yx/me/first-30-days');
    expect(landingFor('super_admin')).toBe('/v2/organizations');
    expect(landingFor('super_admin', true)).toBe('/v2/organizations');
  });
});
