import { PERMISSIONS, ROLE_PERMISSIONS } from '../../prisma/seed';

it('seeds pipelines:configure for org_admin', () => {
  expect(PERMISSIONS.some((p) => p.key === 'pipelines:configure')).toBe(true);
  expect(ROLE_PERMISSIONS.org_admin).toContain('pipelines:configure');
});
