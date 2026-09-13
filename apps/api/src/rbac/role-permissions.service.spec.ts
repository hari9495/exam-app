import { BadRequestException } from '@nestjs/common';
import { RolePermissionsService } from './role-permissions.service';

const CATALOG = [
  { key: 'org:view', description: 'View organization dashboard and data' },
  { key: 'results:view', description: 'View exam results' },
  { key: 'pipeline:manage', description: 'Manage hiring jobs' },
  { key: 'candidate:manage', description: 'Add candidates' },
  { key: 'interview:view_assigned', description: 'View assigned interviews' },
  { key: 'org:manage_users', description: 'Manage users' }, // non-assignable -> filtered out
];

describe('RolePermissionsService', () => {
  let prisma: { rolePermission: { findMany: jest.Mock }; permission: { findMany: jest.Mock } };
  let tx: { orgRolePermission: Record<string, jest.Mock> };
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  let service: RolePermissionsService;
  const ctx = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(() => {
    prisma = {
      rolePermission: {
        findMany: jest.fn().mockResolvedValue([
          { role: 'recruiter', permission: { key: 'results:view' } },
          { role: 'recruiter', permission: { key: 'org:view' } },
          { role: 'panel', permission: { key: 'org:view' } },
          { role: 'hiring_manager', permission: { key: 'org:view' } },
        ]),
      },
      permission: { findMany: jest.fn().mockResolvedValue(CATALOG) },
    };
    tx = {
      orgRolePermission: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    tenantPrisma = { forTenant: jest.fn().mockImplementation((_c, fn) => fn(tx)) };
    audit = { record: jest.fn() };
    service = new RolePermissionsService(prisma as any, tenantPrisma as any, audit as any);
  });

  describe('getMatrix', () => {
    it('returns the three editable roles with defaults, applies overrides, and flags customized', async () => {
      tx.orgRolePermission.findMany.mockResolvedValue([{ role: 'panel', permissionsJson: JSON.stringify(['org:view', 'results:view']) }]);

      const out = await service.getMatrix(ctx);

      expect(out.roles.map((r) => r.role)).toEqual(['hiring_manager', 'recruiter', 'panel']);
      const recruiter = out.roles.find((r) => r.role === 'recruiter')!;
      expect(recruiter.permissions).toEqual(['org:view', 'results:view']); // sorted default
      expect(recruiter.customized).toBe(false);
      const panel = out.roles.find((r) => r.role === 'panel')!;
      expect(panel.permissions).toEqual(['org:view', 'results:view']); // from override
      expect(panel.customized).toBe(true);
      // assignable catalog excludes the non-assignable key
      expect(out.assignablePermissions.map((p) => p.key)).not.toContain('org:manage_users');
      expect(out.assignablePermissions.map((p) => p.key)).toContain('pipeline:manage');
    });
  });

  describe('setRolePermissions', () => {
    it('upserts an override for an editable role and audits it', async () => {
      await service.setRolePermissions(ctx, 'user-1', 'hiring_manager', ['org:view', 'results:view']);
      expect(tx.orgRolePermission.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId_role: { organizationId: 'org-1', role: 'hiring_manager' } },
          create: expect.objectContaining({ role: 'hiring_manager', permissionsJson: JSON.stringify(['org:view', 'results:view']) }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(ctx, expect.objectContaining({ action: 'role_permissions.updated', entityId: 'hiring_manager' }));
    });

    it('rejects a non-editable role (org_admin) without writing', async () => {
      await expect(service.setRolePermissions(ctx, 'user-1', 'org_admin', ['org:view'])).rejects.toThrow(BadRequestException);
      expect(tx.orgRolePermission.upsert).not.toHaveBeenCalled();
    });

    it('rejects super_admin too', async () => {
      await expect(service.setRolePermissions(ctx, 'user-1', 'super_admin', ['org:view'])).rejects.toThrow(BadRequestException);
    });

    it('rejects a non-assignable permission key (privilege-escalation guard)', async () => {
      await expect(service.setRolePermissions(ctx, 'user-1', 'recruiter', ['org:manage_users'])).rejects.toThrow(BadRequestException);
      expect(tx.orgRolePermission.upsert).not.toHaveBeenCalled();
    });

    it('rejects an unknown permission key', async () => {
      await expect(service.setRolePermissions(ctx, 'user-1', 'recruiter', ['made:up'])).rejects.toThrow(BadRequestException);
    });

    it('allows an empty permission set (lock a role down)', async () => {
      await service.setRolePermissions(ctx, 'user-1', 'panel', []);
      expect(tx.orgRolePermission.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ permissionsJson: JSON.stringify([]) }) }),
      );
    });
  });

  describe('resetRole', () => {
    it('deletes the override for an editable role and audits it', async () => {
      await service.resetRole(ctx, 'user-1', 'recruiter');
      expect(tx.orgRolePermission.deleteMany).toHaveBeenCalledWith({ where: { organizationId: 'org-1', role: 'recruiter' } });
      expect(audit.record).toHaveBeenCalledWith(ctx, expect.objectContaining({ action: 'role_permissions.reset', entityId: 'recruiter' }));
    });

    it('rejects resetting a non-editable role', async () => {
      await expect(service.resetRole(ctx, 'user-1', 'org_admin')).rejects.toThrow(BadRequestException);
      expect(tx.orgRolePermission.deleteMany).not.toHaveBeenCalled();
    });
  });
});
