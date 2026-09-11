import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { PERMISSIONS_KEY, PERMISSIONS_ANY_KEY } from './permissions.decorator';

function mockContext(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  it('allows access when the route requires no permissions', async () => {
    const reflector = { get: jest.fn().mockReturnValue(undefined) } as unknown as Reflector;
    const prisma = { rolePermission: { findMany: jest.fn() } };
    const tenantPrisma = { forTenant: jest.fn() };
    const guard = new PermissionsGuard(reflector, prisma as any, tenantPrisma as any);

    const result = await guard.canActivate(mockContext({ role: 'recruiter' }));
    expect(result).toBe(true);
  });

  describe('no profile assigned (existing role-based behavior, unchanged)', () => {
    it('allows access when the role has the required permission', async () => {
      const reflector = { get: jest.fn().mockReturnValue(['org:manage_users']) } as unknown as Reflector;
      const prisma = {
        rolePermission: { findMany: jest.fn().mockResolvedValue([{ permission: { key: 'org:manage_users' } }]) },
      };
      const tenantPrisma = { forTenant: jest.fn() };
      const guard = new PermissionsGuard(reflector, prisma as any, tenantPrisma as any);

      const result = await guard.canActivate(mockContext({ role: 'org_admin', permissionProfileId: null }));
      expect(result).toBe(true);
      expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the role lacks the required permission', async () => {
      const reflector = { get: jest.fn().mockReturnValue(['platform:manage_organizations']) } as unknown as Reflector;
      const prisma = { rolePermission: { findMany: jest.fn().mockResolvedValue([]) } };
      const tenantPrisma = { forTenant: jest.fn() };
      const guard = new PermissionsGuard(reflector, prisma as any, tenantPrisma as any);

      await expect(
        guard.canActivate(mockContext({ role: 'org_admin', permissionProfileId: null })),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows access when the role has at least one of the "any" permissions', async () => {
      const reflector = {
        get: jest.fn((key: string) => (key === PERMISSIONS_ANY_KEY ? ['exam:manage', 'results:view'] : undefined)),
      } as unknown as Reflector;
      const prisma = {
        rolePermission: { findMany: jest.fn().mockResolvedValue([{ permission: { key: 'results:view' } }]) },
      };
      const tenantPrisma = { forTenant: jest.fn() };
      const guard = new PermissionsGuard(reflector, prisma as any, tenantPrisma as any);

      const result = await guard.canActivate(mockContext({ role: 'panel', permissionProfileId: null }));
      expect(result).toBe(true);
    });

    it('throws ForbiddenException when the role has none of the "any" permissions', async () => {
      const reflector = {
        get: jest.fn((key: string) => (key === PERMISSIONS_ANY_KEY ? ['exam:manage', 'results:view'] : undefined)),
      } as unknown as Reflector;
      const prisma = { rolePermission: { findMany: jest.fn().mockResolvedValue([]) } };
      const tenantPrisma = { forTenant: jest.fn() };
      const guard = new PermissionsGuard(reflector, prisma as any, tenantPrisma as any);

      await expect(
        guard.canActivate(mockContext({ role: 'candidate', permissionProfileId: null })),
      ).rejects.toThrow(ForbiddenException);
    });

    it('still enforces the normal permission table for a super_admin session that is not acting', async () => {
      const reflector = { get: jest.fn().mockReturnValue(['candidate:manage']) } as unknown as Reflector;
      const prisma = { rolePermission: { findMany: jest.fn().mockResolvedValue([]) } };
      const tenantPrisma = { forTenant: jest.fn() };
      const guard = new PermissionsGuard(reflector, prisma as any, tenantPrisma as any);

      await expect(
        guard.canActivate(mockContext({ role: 'super_admin', permissionProfileId: null })),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  it('bypasses the permission check entirely when actingSuperAdmin is true, even for an unrelated permission', async () => {
    const reflector = { get: jest.fn().mockReturnValue(['candidate:manage']) } as unknown as Reflector;
    const prisma = { rolePermission: { findMany: jest.fn() } };
    const tenantPrisma = { forTenant: jest.fn() };
    const guard = new PermissionsGuard(reflector, prisma as any, tenantPrisma as any);

    const result = await guard.canActivate(
      mockContext({ role: 'super_admin', actingSuperAdmin: true, permissionProfileId: 'some-profile' }),
    );
    expect(result).toBe(true);
    expect(prisma.rolePermission.findMany).not.toHaveBeenCalled();
    expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
  });

  describe('assigned permission profile (REPLACES the role, not additive)', () => {
    it('allows access when the profile grants the required key, even though the role default lacks it', async () => {
      const reflector = { get: jest.fn().mockReturnValue(['candidate:manage']) } as unknown as Reflector;
      // role perms LACK the key -- if the guard fell back to role, this would deny.
      const prisma = { rolePermission: { findMany: jest.fn().mockResolvedValue([]) } };
      const tenantPrisma = {
        forTenant: jest.fn().mockResolvedValue({ permissionsJson: JSON.stringify(['candidate:manage']) }),
      };
      const guard = new PermissionsGuard(reflector, prisma as any, tenantPrisma as any);

      const result = await guard.canActivate(
        mockContext({ role: 'recruiter', organizationId: 'org-1', permissionProfileId: 'profile-1' }),
      );
      expect(result).toBe(true);
      expect(prisma.rolePermission.findMany).not.toHaveBeenCalled();
    });

    it('denies access when the profile lacks the required key, even though the role default would have granted it', async () => {
      const reflector = { get: jest.fn().mockReturnValue(['candidate:manage']) } as unknown as Reflector;
      // role perms HAVE the key -- proves the profile REPLACES rather than adds to the role.
      const prisma = {
        rolePermission: { findMany: jest.fn().mockResolvedValue([{ permission: { key: 'candidate:manage' } }]) },
      };
      const tenantPrisma = {
        forTenant: jest.fn().mockResolvedValue({ permissionsJson: JSON.stringify(['other:key']) }),
      };
      const guard = new PermissionsGuard(reflector, prisma as any, tenantPrisma as any);

      await expect(
        guard.canActivate(mockContext({ role: 'org_admin', organizationId: 'org-1', permissionProfileId: 'profile-1' })),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.rolePermission.findMany).not.toHaveBeenCalled();
    });

    it('fails closed (Forbidden) when the assigned profile no longer exists, never falling back to role', async () => {
      const reflector = { get: jest.fn().mockReturnValue(['candidate:manage']) } as unknown as Reflector;
      const prisma = {
        rolePermission: { findMany: jest.fn().mockResolvedValue([{ permission: { key: 'candidate:manage' } }]) },
      };
      const tenantPrisma = { forTenant: jest.fn().mockResolvedValue(null) };
      const guard = new PermissionsGuard(reflector, prisma as any, tenantPrisma as any);

      await expect(
        guard.canActivate(
          mockContext({ role: 'org_admin', organizationId: 'org-1', permissionProfileId: 'deleted-profile' }),
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.rolePermission.findMany).not.toHaveBeenCalled();
    });

    it('resolves the profile via TenantPrismaService.forTenant scoped to the user org, not a raw prisma read', async () => {
      const reflector = { get: jest.fn().mockReturnValue(['candidate:manage']) } as unknown as Reflector;
      const prisma = { rolePermission: { findMany: jest.fn() }, permissionProfile: { findUnique: jest.fn() } };
      const tenantPrisma = {
        forTenant: jest.fn().mockResolvedValue({ permissionsJson: JSON.stringify(['candidate:manage']) }),
      };
      const guard = new PermissionsGuard(reflector, prisma as any, tenantPrisma as any);

      await guard.canActivate(
        mockContext({ role: 'recruiter', organizationId: 'org-1', permissionProfileId: 'profile-1' }),
      );

      expect(tenantPrisma.forTenant).toHaveBeenCalledWith(
        { organizationId: 'org-1', isSuperAdmin: false },
        expect.any(Function),
      );
      expect(prisma.permissionProfile.findUnique).not.toHaveBeenCalled();
    });

    it('allows access via the "any" check against the profile-derived grant set', async () => {
      const reflector = {
        get: jest.fn((key: string) => (key === PERMISSIONS_ANY_KEY ? ['exam:manage', 'results:view'] : undefined)),
      } as unknown as Reflector;
      const prisma = { rolePermission: { findMany: jest.fn() } };
      const tenantPrisma = {
        forTenant: jest.fn().mockResolvedValue({ permissionsJson: JSON.stringify(['results:view']) }),
      };
      const guard = new PermissionsGuard(reflector, prisma as any, tenantPrisma as any);

      const result = await guard.canActivate(
        mockContext({ role: 'panel', organizationId: 'org-1', permissionProfileId: 'profile-1' }),
      );
      expect(result).toBe(true);
    });

    it('denies via the "any" check when the profile grants none of the required keys', async () => {
      const reflector = {
        get: jest.fn((key: string) => (key === PERMISSIONS_ANY_KEY ? ['exam:manage', 'results:view'] : undefined)),
      } as unknown as Reflector;
      const prisma = { rolePermission: { findMany: jest.fn() } };
      const tenantPrisma = {
        forTenant: jest.fn().mockResolvedValue({ permissionsJson: JSON.stringify(['unrelated:key']) }),
      };
      const guard = new PermissionsGuard(reflector, prisma as any, tenantPrisma as any);

      await expect(
        guard.canActivate(mockContext({ role: 'panel', organizationId: 'org-1', permissionProfileId: 'profile-1' })),
      ).rejects.toThrow(ForbiddenException);
    });

    it('enforces requiredAll against the profile grant set (must have every key)', async () => {
      const reflector = { get: jest.fn().mockReturnValue(['candidate:manage', 'candidate:delete']) } as unknown as Reflector;
      const prisma = { rolePermission: { findMany: jest.fn() } };
      const tenantPrisma = {
        forTenant: jest.fn().mockResolvedValue({ permissionsJson: JSON.stringify(['candidate:manage']) }),
      };
      const guard = new PermissionsGuard(reflector, prisma as any, tenantPrisma as any);

      await expect(
        guard.canActivate(
          mockContext({ role: 'recruiter', organizationId: 'org-1', permissionProfileId: 'profile-1' }),
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
