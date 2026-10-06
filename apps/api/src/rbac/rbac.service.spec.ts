import { Test } from '@nestjs/testing';
import { RbacService } from './rbac.service';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';

describe('RbacService', () => {
  let service: RbacService;
  let prisma: { rolePermission: { findMany: jest.Mock } };
  let tx: { permissionProfile: { findUnique: jest.Mock }; orgRolePermission: { findUnique: jest.Mock } };

  beforeEach(async () => {
    prisma = { rolePermission: { findMany: jest.fn() } };
    tx = { permissionProfile: { findUnique: jest.fn() }, orgRolePermission: { findUnique: jest.fn().mockResolvedValue(null) } };
    const moduleRef = await Test.createTestingModule({
      providers: [
        RbacService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantPrismaService, useValue: { forTenant: (_c: unknown, fn: (t: unknown) => unknown) => fn(tx) } },
      ],
    }).compile();
    service = moduleRef.get(RbacService);
  });

  it('groups permissions by role, sorted alphabetically within each role', async () => {
    prisma.rolePermission.findMany.mockResolvedValue([
      { role: 'org_admin', permission: { key: 'org:view' } },
      { role: 'org_admin', permission: { key: 'audit:view' } },
      { role: 'recruiter', permission: { key: 'exam:manage' } },
    ]);

    const result = await service.listRoles();

    expect(result).toEqual([
      { role: 'org_admin', permissions: ['audit:view', 'org:view'] },
      { role: 'recruiter', permissions: ['exam:manage'] },
    ]);
  });

  it('returns an empty array when no role/permission grants exist', async () => {
    prisma.rolePermission.findMany.mockResolvedValue([]);

    const result = await service.listRoles();

    expect(result).toEqual([]);
  });

  describe('grantedKeys: the screens see the same grants the guard uses', () => {
    it('returns only the asked-for keys a permission profile grants', async () => {
      tx.permissionProfile.findUnique.mockResolvedValue({ permissionsJson: JSON.stringify(['org.structure.view', 'pay.range.view', 'exam:manage']) });
      const keys = await service.grantedKeys({ role: 'panel', organizationId: 'org-1', permissionProfileId: 'p-1' }, ['org.structure.view', 'pay.range.view', 'org.settings.manage', 'pay.range.view']);
      expect(keys).toEqual(['org.structure.view', 'pay.range.view']);
    });

    it('falls back to the role grants; nothing extra is ever returned', async () => {
      prisma.rolePermission.findMany.mockResolvedValue([{ permission: { key: 'org.settings.manage' } }]);
      expect(await service.grantedKeys({ role: 'org_admin', organizationId: 'org-1' }, ['org.settings.manage', 'pay.range.view'])).toEqual(['org.settings.manage']);
    });
  });
});
