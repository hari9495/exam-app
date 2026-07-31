import { isOrganizationActive, ORGANIZATION_STATUSES, ORGANIZATION_INACTIVE_MESSAGE } from './organization-status';

describe('isOrganizationActive', () => {
  it('is true only for the exact string "active"', () => {
    expect(isOrganizationActive('active')).toBe(true);
    expect(isOrganizationActive('suspended')).toBe(false);
    expect(isOrganizationActive('deleted')).toBe(false);
  });

  it('treats a missing or unrecognised status as inactive', () => {
    // Fail closed. An unreadable status, or one added later without updating
    // this function, must never grant access by default.
    expect(isOrganizationActive(null)).toBe(false);
    expect(isOrganizationActive(undefined)).toBe(false);
    expect(isOrganizationActive('')).toBe(false);
    expect(isOrganizationActive('ACTIVE')).toBe(false);
    expect(isOrganizationActive(' active ')).toBe(false);
    expect(isOrganizationActive('whatever')).toBe(false);
  });

  it('enumerates exactly the three known statuses', () => {
    expect(ORGANIZATION_STATUSES).toEqual(['active', 'suspended', 'deleted']);
  });

  it('exposes a staff-facing message that does not name a reason', () => {
    // Candidates must never see this string -- see the candidate-auth guard,
    // which reuses the neutral "exam not available" wording instead.
    expect(ORGANIZATION_INACTIVE_MESSAGE).toBe('This organization is not currently active');
  });
});
