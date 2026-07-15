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
    const guard = new PermissionsGuard(reflector, prisma as any);

    const result = await guard.canActivate(mockContext({ role: 'recruiter' }));
    expect(result).toBe(true);
  });

  it('allows access when the role has the required permission', async () => {
    const reflector = { get: jest.fn().mockReturnValue(['org:manage_users']) } as unknown as Reflector;
    const prisma = {
      rolePermission: {
        findMany: jest.fn().mockResolvedValue([{ permission: { key: 'org:manage_users' } }]),
      },
    };
    const guard = new PermissionsGuard(reflector, prisma as any);

    const result = await guard.canActivate(mockContext({ role: 'org_admin' }));
    expect(result).toBe(true);
  });

  it('throws ForbiddenException when the role lacks the required permission', async () => {
    const reflector = { get: jest.fn().mockReturnValue(['platform:manage_organizations']) } as unknown as Reflector;
    const prisma = { rolePermission: { findMany: jest.fn().mockResolvedValue([]) } };
    const guard = new PermissionsGuard(reflector, prisma as any);

    await expect(guard.canActivate(mockContext({ role: 'org_admin' }))).rejects.toThrow(ForbiddenException);
  });

  it('allows access when the role has at least one of the "any" permissions', async () => {
    const reflector = {
      get: jest.fn((key: string) => (key === PERMISSIONS_ANY_KEY ? ['exam:manage', 'results:view'] : undefined)),
    } as unknown as Reflector;
    const prisma = {
      rolePermission: { findMany: jest.fn().mockResolvedValue([{ permission: { key: 'results:view' } }]) },
    };
    const guard = new PermissionsGuard(reflector, prisma as any);

    const result = await guard.canActivate(mockContext({ role: 'panel' }));
    expect(result).toBe(true);
  });

  it('throws ForbiddenException when the role has none of the "any" permissions', async () => {
    const reflector = {
      get: jest.fn((key: string) => (key === PERMISSIONS_ANY_KEY ? ['exam:manage', 'results:view'] : undefined)),
    } as unknown as Reflector;
    const prisma = { rolePermission: { findMany: jest.fn().mockResolvedValue([]) } };
    const guard = new PermissionsGuard(reflector, prisma as any);

    await expect(guard.canActivate(mockContext({ role: 'candidate' }))).rejects.toThrow(ForbiddenException);
  });
});
