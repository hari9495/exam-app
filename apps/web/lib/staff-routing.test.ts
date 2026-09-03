import { roleToLandingPath } from './staff-routing';

describe('roleToLandingPath', () => {
  it('routes super_admin to /organizations', () => {
    expect(roleToLandingPath('super_admin')).toBe('/organizations');
  });
  it('routes org_admin to /users', () => {
    expect(roleToLandingPath('org_admin')).toBe('/users');
  });
  it('routes panel to /reports', () => {
    expect(roleToLandingPath('panel')).toBe('/reports');
  });
  it('routes recruiter (default) to /dashboard', () => {
    expect(roleToLandingPath('recruiter')).toBe('/dashboard');
  });
  it('routes unknown/undefined to /dashboard', () => {
    expect(roleToLandingPath(undefined)).toBe('/dashboard');
  });
});
