import { PERMISSIONS, ROLE_PERMISSIONS } from '../../prisma/seed';

it('seeds approvals:configure for org_admin', () => {
  expect(PERMISSIONS.some((p) => p.key === 'approvals:configure')).toBe(true);
  expect(ROLE_PERMISSIONS.org_admin).toContain('approvals:configure');
});
