import { roleToLandingPath } from './staff-routing';
import { staffLandingPath } from './staff-landing';

describe('roleToLandingPath (decision 2398: no role lands on /v2)', () => {
  it('routes super_admin to the platform console', () => {
    expect(roleToLandingPath('super_admin')).toBe('/staff/companies');
  });
  it.each(['org_admin', 'panel', 'auditor', 'recruiter', 'hiring_manager', undefined])('routes %s to the YukthiX Home', (role) => {
    expect(roleToLandingPath(role)).toBe('/yx/home');
  });
  it('staffLandingPath (impersonation, return-to-admin) agrees, and never names /v2', () => {
    for (const role of ['super_admin', 'org_admin', 'panel', 'auditor', 'recruiter', null, undefined]) {
      expect(staffLandingPath(role)).toBe(roleToLandingPath(role ?? undefined));
      expect(staffLandingPath(role)).not.toMatch(/^\/v2/);
    }
  });
});
