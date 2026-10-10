import { landingFor } from './yx-landing';

describe('landingFor (where a YukthiX sign-in lands)', () => {
  it('sends HR without exam/ATS permissions to the directory', () => {
    expect(landingFor('panel', ['employee.profile.view'])).toBe('/yx/people/directory');
    // M14: a Service Desk agent lands on their ticket queue, even when they also have an employee record.
    expect(landingFor('panel', ['desk.ticket.view', 'results:view'], true)).toBe('/yx/desk/tickets');
  });

  it('a new hire in their first 30 days lands on that page, before the directory (lifecycle 6f)', () => {
    expect(landingFor('panel', ['employee.profile.view'], true, true)).toBe('/yx/me/first-30-days');
    expect(landingFor('super_admin', [], false, true)).not.toBe('/yx/me/first-30-days');
  });

  it('sends someone with neither to My security', () => {
    expect(landingFor('panel', [])).toBe('/yx/me/security');
  });

  it('keeps the role console for exam/ATS people (recruiter, admin, panelist)', () => {
    expect(landingFor('recruiter', ['exam:manage', 'results:view'])).toBe('/v2/today');
    expect(landingFor('org_admin', ['exam:manage', 'employee.profile.view'])).toBe('/yx/people/directory');
    expect(landingFor('org_admin', ['exam:manage', 'org.settings.manage'])).toBe('/yx/settings/legal-entities');
    expect(landingFor('panel', ['results:view'])).toBe('/v2/panel/reports');
    expect(landingFor('super_admin', [])).toBe('/v2/organizations');
  });
  it('an employee lands in YukthiX even with exam / interview access', () => {
    expect(landingFor('panel', ['results:view', 'interview:view_assigned'], true)).toBe('/yx/people/profile');
    expect(landingFor('org_admin', ['exam:manage', 'employee.profile.view'], true)).toBe('/yx/people/directory');
    expect(landingFor('recruiter', ['exam:manage'], false)).toBe('/v2/today');
  });
});
