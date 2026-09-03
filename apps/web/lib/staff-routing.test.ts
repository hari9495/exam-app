import { roleToLandingPath } from './staff-routing';

describe('roleToLandingPath', () => {
  it('routes super_admin to /v2/organizations', () => {
    expect(roleToLandingPath('super_admin')).toBe('/v2/organizations');
  });
  it('routes org_admin to /v2/users', () => {
    expect(roleToLandingPath('org_admin')).toBe('/v2/users');
  });
  it('routes panel to /v2/panel/reports', () => {
    expect(roleToLandingPath('panel')).toBe('/v2/panel/reports');
  });
  it('routes recruiter (default) to /v2/dashboard', () => {
    expect(roleToLandingPath('recruiter')).toBe('/v2/dashboard');
  });
  it('routes unknown/undefined to /v2/dashboard', () => {
    expect(roleToLandingPath(undefined)).toBe('/v2/dashboard');
  });
});
