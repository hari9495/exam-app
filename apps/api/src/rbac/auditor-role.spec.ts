import { ROLE_PERMISSIONS } from '../../prisma/seed';
import { CREATABLE_ROLES, EDITABLE_ROLES } from './roles';

// The auditor role is a compliance read-only role. These tests are the guardrail that keeps it
// read-only: they fail if anyone later grants it a write key or makes its grants editable.
describe('auditor role (compliance read-only)', () => {
  const READ_ONLY_KEYS = ['org:view', 'results:view', 'audit:view', 'ai_jobs:view', 'candidate:view', 'question_bank:view', 'interview:view_assigned'];

  it('is seeded with only read keys', () => {
    const keys = ROLE_PERMISSIONS.auditor;
    expect(keys).toBeDefined();
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(READ_ONLY_KEYS).toContain(key);
  });

  it('holds no write/manage/configure/data-rights capability', () => {
    for (const key of ROLE_PERMISSIONS.auditor) {
      expect(key).not.toMatch(/:manage|:configure|:manage_|data_rights|:manage_organizations/);
    }
  });

  it('is assignable to a user but NOT editable (its grants stay fixed read-only)', () => {
    expect(CREATABLE_ROLES).toContain('auditor');
    expect(EDITABLE_ROLES as readonly string[]).not.toContain('auditor');
  });
});
