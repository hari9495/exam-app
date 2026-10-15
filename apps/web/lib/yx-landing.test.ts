import { landingFor } from './yx-landing';

describe('landingFor (where a YukthiX sign-in lands)', () => {
  it('sends HR, desk agents and settings admins to Home (design audit step 1)', () => {
    expect(landingFor('panel', ['employee.profile.view'])).toBe('/yx/home');
    expect(landingFor('panel', ['desk.ticket.view', 'results:view'], true)).toBe('/yx/home');
    expect(landingFor('org_admin', ['exam:manage', 'org.settings.manage'])).toBe('/yx/home');
  });

  it('a new hire in their first 30 days lands on that page, before Home (lifecycle 6f)', () => {
    expect(landingFor('panel', ['employee.profile.view'], true, true)).toBe('/yx/me/first-30-days');
    expect(landingFor('super_admin', [], false, true)).not.toBe('/yx/me/first-30-days');
  });

  it('sends someone with no keys and no record to Home too', () => {
    expect(landingFor('panel', [])).toBe('/yx/home');
  });

  it('keeps the role console for exam/ATS people with no employee record, and for platform staff', () => {
    expect(landingFor('recruiter', ['exam:manage', 'results:view'])).toBe('/v2/today');
    expect(landingFor('panel', ['results:view'])).toBe('/v2/panel/reports');
    expect(landingFor('super_admin', [])).toBe('/v2/organizations');
  });

  it('an employee lands in YukthiX even with exam / interview access', () => {
    expect(landingFor('panel', ['results:view', 'interview:view_assigned'], true)).toBe('/yx/home');
    expect(landingFor('org_admin', ['exam:manage', 'employee.profile.view'], true)).toBe('/yx/home');
    expect(landingFor('recruiter', ['exam:manage'], false)).toBe('/v2/today');
  });
});
