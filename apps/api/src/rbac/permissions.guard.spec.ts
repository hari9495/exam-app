import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { PERMISSIONS_KEY, PERMISSIONS_ANY_KEY } from './permissions.decorator';
import { DEFAULT_SECURITY_POLICY, MFA_REQUIRED_CODE, STEP_UP_REQUIRED_CODE, invalidateTenantSecurityPolicy } from '@exam-platform/shared';
import { SENSITIVE_ROLE_ACTION, STEP_UP_REQUIRED } from '../auth/step-up.decorator';

// Every staff request carries its session's assurance (JwtStrategy). Default: AAL2, just verified.
const AAL2 = { assuranceLevel: 'aal2', mfaVerifiedAt: new Date(), mfaMethod: 'totp', mfaEnrolmentDueAt: new Date(0) };

function mockContext(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user: user && { session: AAL2, ...(user as object) } }) }),
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

  describe('per-org role override (Salesforce-style role editing)', () => {
    it('grants from the org override, ignoring the global role default, when a row exists', async () => {
      const reflector = { get: jest.fn().mockReturnValue(['candidate:manage']) } as unknown as Reflector;
      // global default lacks it -- if the guard used the global table, this would deny.
      const prisma = { rolePermission: { findMany: jest.fn().mockResolvedValue([]) } };
      const tenantPrisma = { forTenant: jest.fn().mockResolvedValue({ permissionsJson: JSON.stringify(['candidate:manage']) }) };
      const guard = new PermissionsGuard(reflector, prisma as any, tenantPrisma as any);

      const result = await guard.canActivate(
        mockContext({ role: 'hiring_manager', organizationId: 'org-1', permissionProfileId: null }),
      );
      expect(result).toBe(true);
      // override short-circuits -> the global role table is never queried
      expect(prisma.rolePermission.findMany).not.toHaveBeenCalled();
      expect(tenantPrisma.forTenant).toHaveBeenCalledWith({ organizationId: 'org-1', isSuperAdmin: false }, expect.any(Function));
    });

    it('denies when the org override omits the key, even if the global default would grant it', async () => {
      const reflector = { get: jest.fn().mockReturnValue(['pipeline:manage']) } as unknown as Reflector;
      const prisma = { rolePermission: { findMany: jest.fn().mockResolvedValue([{ permission: { key: 'pipeline:manage' } }]) } };
      const tenantPrisma = { forTenant: jest.fn().mockResolvedValue({ permissionsJson: JSON.stringify(['org:view']) }) };
      const guard = new PermissionsGuard(reflector, prisma as any, tenantPrisma as any);

      await expect(
        guard.canActivate(mockContext({ role: 'recruiter', organizationId: 'org-1', permissionProfileId: null })),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.rolePermission.findMany).not.toHaveBeenCalled();
    });

    it('falls back to the global role default when the org has no override row', async () => {
      const reflector = { get: jest.fn().mockReturnValue(['candidate:manage']) } as unknown as Reflector;
      const prisma = { rolePermission: { findMany: jest.fn().mockResolvedValue([{ permission: { key: 'candidate:manage' } }]) } };
      const tenantPrisma = { forTenant: jest.fn().mockResolvedValue(null) }; // no override row
      const guard = new PermissionsGuard(reflector, prisma as any, tenantPrisma as any);

      const result = await guard.canActivate(
        mockContext({ role: 'recruiter', organizationId: 'org-1', permissionProfileId: null }),
      );
      expect(result).toBe(true);
      expect(tenantPrisma.forTenant).toHaveBeenCalled(); // checked for an override
      expect(prisma.rolePermission.findMany).toHaveBeenCalled(); // then fell back to global
    });
  });

  describe("the company's admin-console IP allow-list (YX-IAM-09)", () => {
    const ORG = 'org-admin-ip';
    const build = (required: string[]) => {
      const reflector = { get: jest.fn((key: string) => (key === PERMISSIONS_KEY ? required : undefined)) } as unknown as Reflector;
      const prisma = { rolePermission: { findMany: jest.fn().mockResolvedValue(required.map((key) => ({ permission: { key } }))) } };
      const tx = {
        tenantSecurityPolicy: { findUnique: jest.fn().mockResolvedValue({ ...DEFAULT_SECURITY_POLICY, ipAllowlistAdmin: ['203.0.113.0/24'], organizationId: ORG }) },
        orgRolePermission: { findUnique: jest.fn().mockResolvedValue(null) },
      };
      const tenantPrisma = { forTenant: jest.fn(async (_c: unknown, fn: (t: unknown) => unknown) => fn(tx)) };
      return new PermissionsGuard(reflector, prisma as any, tenantPrisma as any);
    };
    const ctx = (user: object, ip: string) =>
      ({ switchToHttp: () => ({ getRequest: () => ({ user: { session: AAL2, ...user }, ip }) }), getHandler: () => ({}) }) as unknown as ExecutionContext;
    const admin = { role: 'org_admin', organizationId: ORG, permissionProfileId: null };
    beforeEach(() => invalidateTenantSecurityPolicy(ORG));

    it('refuses an org:manage_* endpoint from outside the list with 403, even for an admin', async () => {
      await expect(build(['org:manage_settings']).canActivate(ctx(admin, '192.0.2.1'))).rejects.toThrow(ForbiddenException);
    });

    it('allows it from inside the list', async () => {
      await expect(build(['org:manage_users']).canActivate(ctx(admin, '203.0.113.4'))).resolves.toBe(true);
    });

    it('does not apply to everyday (non-admin) endpoints', async () => {
      await expect(build(['exam:manage']).canActivate(ctx(admin, '192.0.2.1'))).resolves.toBe(true);
    });

    it('does not bind platform staff acting inside the company', async () => {
      await expect(
        build(['org:manage_settings']).canActivate(ctx({ role: 'super_admin', organizationId: ORG, actingSuperAdmin: true }, '192.0.2.1')),
      ).resolves.toBe(true);
    });
  });

  describe('MFA floor (YX-IAM-01) and step-up (YX-IAM-02)', () => {
    const ORG = 'org-mfa';
    const auditLogs = { create: jest.fn() };
    const HOUR = 3600 * 1000;
    const AAL1_IN_GRACE = { assuranceLevel: 'aal1', mfaVerifiedAt: null, mfaMethod: null, mfaEnrolmentDueAt: new Date(Date.now() + 24 * HOUR) };
    const AAL1_PAST_DUE = { ...AAL1_IN_GRACE, mfaEnrolmentDueAt: new Date(Date.now() - HOUR) };
    const build = (meta: Record<string, unknown>, policy: Partial<typeof DEFAULT_SECURITY_POLICY> = {}) => {
      const required = (meta[PERMISSIONS_KEY] as string[] | undefined) ?? [];
      const reflector = { get: jest.fn((key: string) => meta[key]) } as unknown as Reflector;
      const prisma = { rolePermission: { findMany: jest.fn().mockResolvedValue(required.map((key) => ({ permission: { key } }))) } };
      const tx = {
        tenantSecurityPolicy: { findUnique: jest.fn().mockResolvedValue({ ...DEFAULT_SECURITY_POLICY, ...policy, organizationId: ORG }) },
        orgRolePermission: { findUnique: jest.fn().mockResolvedValue(null) },
        user: { findUnique: jest.fn().mockResolvedValue(null) },
        auditLog: auditLogs,
      };
      const tenantPrisma = { forTenant: jest.fn(async (_c: unknown, fn: (t: unknown) => unknown) => fn(tx)) };
      return new PermissionsGuard(reflector, prisma as any, tenantPrisma as any);
    };
    const ctx = (user: object) =>
      ({
        switchToHttp: () => ({ getRequest: () => ({ user, ip: '203.0.113.1', method: 'PATCH', path: '/x', route: { path: '/x' } }) }),
        getHandler: () => ({}),
      }) as unknown as ExecutionContext;
    const admin = (session: object) => ({ userId: 'u-1', role: 'org_admin', organizationId: ORG, permissionProfileId: null, session });
    const outcome = async (promise: Promise<unknown>) => {
      try {
        await promise;
        return 'allowed';
      } catch (error) {
        return ((error as ForbiddenException).getResponse() as { code?: string }).code ?? 'forbidden';
      }
    };
    beforeEach(() => {
      invalidateTenantSecurityPolicy(ORG);
      auditLogs.create.mockClear();
    });

    it('a sensitive-role permission needs AAL2 once the enrolment grace is over', async () => {
      const guard = build({ [PERMISSIONS_KEY]: ['org:manage_users'] });
      expect(await outcome(guard.canActivate(ctx(admin(AAL1_PAST_DUE))))).toBe(MFA_REQUIRED_CODE);
      expect(await outcome(guard.canActivate(ctx(admin(AAL1_IN_GRACE))))).toBe('allowed');
      expect(await outcome(guard.canActivate(ctx(admin(AAL2))))).toBe('allowed');
    });

    it('everyday permissions stay usable at AAL1, unless the company requires MFA for everyone', async () => {
      expect(await outcome(build({ [PERMISSIONS_KEY]: ['exam:manage'] }).canActivate(ctx(admin(AAL1_PAST_DUE))))).toBe('allowed');
      invalidateTenantSecurityPolicy(ORG);
      const strict = build({ [PERMISSIONS_KEY]: ['exam:manage'] }, { mfaScope: 'all' });
      expect(await outcome(strict.canActivate(ctx(admin(AAL1_PAST_DUE))))).toBe(MFA_REQUIRED_CODE);
    });

    it('proctor / evaluator actions (@SensitiveRoleAction) need AAL2 past the grace', async () => {
      const guard = build({ [PERMISSIONS_KEY]: ['exam:manage'], [SENSITIVE_ROLE_ACTION]: true });
      expect(await outcome(guard.canActivate(ctx(admin(AAL1_PAST_DUE))))).toBe(MFA_REQUIRED_CODE);
    });

    it('platform staff need AAL2 for anything gated, even acting inside a company', async () => {
      const guard = build({ [PERMISSIONS_KEY]: ['candidate:manage'] });
      const staff = { userId: 's-1', role: 'super_admin', organizationId: ORG, actingSuperAdmin: true, session: AAL1_PAST_DUE };
      expect(await outcome(guard.canActivate(ctx(staff)))).toBe(MFA_REQUIRED_CODE);
    });

    it('a request without session state fails closed', async () => {
      const guard = build({ [PERMISSIONS_KEY]: ['exam:manage'] });
      expect(await outcome(guard.canActivate(ctx({ role: 'recruiter', organizationId: ORG })))).toBe(MFA_REQUIRED_CODE);
    });

    it('a step-up action needs AAL2 proven within the window, and the step-up is audited', async () => {
      const guard = build({ [PERMISSIONS_KEY]: ['org:manage_settings'], [STEP_UP_REQUIRED]: true });
      const stale = { ...AAL2, mfaVerifiedAt: new Date(Date.now() - 16 * 60 * 1000) };
      expect(await outcome(guard.canActivate(ctx(admin(stale))))).toBe(STEP_UP_REQUIRED_CODE);
      expect(await outcome(guard.canActivate(ctx(admin(AAL1_IN_GRACE))))).toBe(STEP_UP_REQUIRED_CODE); // no grace for step-up
      expect(auditLogs.create).not.toHaveBeenCalled();

      const fresh = { ...AAL2, mfaVerifiedAt: new Date(Date.now() - 60 * 1000) };
      expect(await outcome(guard.canActivate(ctx(admin(fresh))))).toBe('allowed');
      expect(auditLogs.create).toHaveBeenCalledWith({ data: expect.objectContaining({ organizationId: ORG, action: 'step_up.used', actorUserId: 'u-1' }) });
      const metadata = JSON.parse(auditLogs.create.mock.calls[0][0].data.metadataJson);
      expect(metadata).toMatchObject({ factor: 'totp', route: 'PATCH /x' });
    });

    it('a fresh AAL2 from a one-time code (fallback factor) meets the MFA floor but never a step-up (YX-IAM-03)', async () => {
      const otpSession = { ...AAL2, mfaMethod: 'otp', mfaVerifiedAt: new Date(Date.now() - 60 * 1000) };
      const stepUp = build({ [PERMISSIONS_KEY]: ['exam:manage'], [STEP_UP_REQUIRED]: true });
      expect(await outcome(stepUp.canActivate(ctx({ role: 'recruiter', organizationId: ORG, session: otpSession })))).toBe(STEP_UP_REQUIRED_CODE);
      const floor = build({ [PERMISSIONS_KEY]: ['exam:manage'], [SENSITIVE_ROLE_ACTION]: true });
      expect(await outcome(floor.canActivate(ctx({ role: 'recruiter', organizationId: ORG, session: { ...otpSession, mfaEnrolmentDueAt: new Date(0) } })))).toBe('allowed');
    });

    it('a stricter STEP_UP_WINDOW_MINUTES shortens the window; a laxer one is clamped to 15 min', async () => {
      const guard = build({ [PERMISSIONS_KEY]: ['org:manage_settings'], [STEP_UP_REQUIRED]: true });
      const tenMinutesAgo = { ...AAL2, mfaVerifiedAt: new Date(Date.now() - 10 * 60 * 1000) };
      const twentyMinutesAgo = { ...AAL2, mfaVerifiedAt: new Date(Date.now() - 20 * 60 * 1000) };
      try {
        process.env.STEP_UP_WINDOW_MINUTES = '5';
        expect(await outcome(guard.canActivate(ctx(admin(tenMinutesAgo))))).toBe(STEP_UP_REQUIRED_CODE);
        process.env.STEP_UP_WINDOW_MINUTES = '60';
        expect(await outcome(guard.canActivate(ctx(admin(twentyMinutesAgo))))).toBe(STEP_UP_REQUIRED_CODE);
      } finally {
        delete process.env.STEP_UP_WINDOW_MINUTES;
      }
    });

    it('a missing permission is reported before MFA or step-up', async () => {
      const meta: Record<string, unknown> = { [PERMISSIONS_KEY]: ['org:manage_users'], [STEP_UP_REQUIRED]: true };
      const reflector = { get: jest.fn((key: string) => meta[key]) } as unknown as Reflector;
      const prisma = { rolePermission: { findMany: jest.fn().mockResolvedValue([]) } };
      const tenantPrisma = { forTenant: jest.fn().mockResolvedValue(null) };
      const guard = new PermissionsGuard(reflector, prisma as any, tenantPrisma as any);
      await expect(guard.canActivate(ctx({ role: 'recruiter', organizationId: ORG, session: AAL1_PAST_DUE }))).rejects.toThrow('Missing required permission');
    });
  });
});
