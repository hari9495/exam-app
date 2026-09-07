import { RECORD_VISIBILITY_GOVERNED_ROLES, isRecordVisibilityGoverned } from './record-visibility';

describe('record-visibility governed roles', () => {
  it('governs recruiter only', () => {
    expect(RECORD_VISIBILITY_GOVERNED_ROLES).toEqual(['recruiter']);
    expect(isRecordVisibilityGoverned('recruiter')).toBe(true);
  });
  it('does not govern admins, panel, super_admin, or an absent role', () => {
    for (const r of ['org_admin', 'panel', 'super_admin', '', null, undefined]) {
      expect(isRecordVisibilityGoverned(r as string | null | undefined)).toBe(false);
    }
  });
});
