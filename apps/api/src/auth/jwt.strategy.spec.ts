import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { DEFAULT_SECURITY_POLICY, invalidateTenantSecurityPolicy } from '@exam-platform/shared';
import { JwtStrategy, JwtPayload } from './jwt.strategy';

describe('JwtStrategy.validate', () => {
  const SID = '22222222-2222-4222-8222-222222222222';
  const U1 = '11111111-1111-4111-8111-111111111111';
  const ADMIN = '33333333-3333-4333-8333-333333333333';
  let strategy: JwtStrategy;
  let tenantPrisma: { forTenant: jest.Mock };
  let live: boolean;
  let deskList: string[];
  const sessionLive = (value: boolean) => (live = value);
  const ASSURANCE = { assuranceLevel: 'aal2', mfaVerifiedAt: new Date(), mfaMethod: 'totp', mfaEnrolmentDueAt: new Date() };
  // Super-admin context = the session touch; tenant context = the company's security policy.
  const fakeForTenant = async (ctx: { isSuperAdmin: boolean }) =>
    ctx.isSuperAdmin ? (live ? [ASSURANCE] : []) : { ...DEFAULT_SECURITY_POLICY, ipAllowlistDesk: deskList, organizationId: 'org1' };
  const validate = (payload: JwtPayload, ip = '203.0.113.5') => strategy.validate({ ip } as never, payload);

  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = 'test-secret';
  });

  beforeEach(() => {
    tenantPrisma = { forTenant: jest.fn(fakeForTenant) };
    sessionLive(true);
    deskList = [];
    invalidateTenantSecurityPolicy('org1');
    strategy = new JwtStrategy(tenantPrisma as any);
  });

  it('passes impersonation claims and the session id through to the request user', async () => {
    const user = await validate({
      sub: U1, organizationId: 'org1', role: 'recruiter',
      impersonatorUserId: ADMIN, impersonatorEmail: 'admin@x.com', sid: SID,
    });
    expect(user).toEqual(expect.objectContaining({
      userId: U1, role: 'recruiter', impersonatorUserId: ADMIN, impersonatorEmail: 'admin@x.com', sessionId: SID,
      // The session's assurance (MFA) travels with the request for PermissionsGuard.
      session: ASSURANCE,
    }));
  });

  it('leaves impersonation claims undefined for a normal token', async () => {
    const user = await validate({ sub: U1, organizationId: 'org1', role: 'org_admin', sid: SID });
    expect(user.impersonatorUserId).toBeUndefined();
  });

  it('surfaces permissionProfileId on the request user', async () => {
    const user = await validate({ sub: U1, organizationId: 'org1', role: 'recruiter', permissionProfileId: 'profile-1', sid: SID });
    expect(user.permissionProfileId).toBe('profile-1');
  });

  it('defaults permissionProfileId to null when the claim is absent', async () => {
    const user = await validate({ sub: U1, organizationId: 'org1', role: 'recruiter', sid: SID });
    expect(user.permissionProfileId).toBeNull();
  });

  it('rejects a validly signed token whose session is revoked, expired or idle (YX-IAM-06)', async () => {
    sessionLive(false);
    await expect(validate({ sub: U1, organizationId: 'org1', role: 'recruiter', sid: SID })).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a pre-sessions token with no sid without a database round trip', async () => {
    await expect(validate({ sub: U1, organizationId: 'org1', role: 'recruiter' })).rejects.toThrow(UnauthorizedException);
    expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
  });

  it('rejects a malformed sid without a database round trip', async () => {
    await expect(
      validate({ sub: U1, organizationId: 'org1', role: 'recruiter', sid: "x' OR 1=1 --" }),
    ).rejects.toThrow(UnauthorizedException);
    expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
  });

  describe('company desk IP allow-list (YX-IAM-09)', () => {
    beforeEach(() => {
      deskList = ['203.0.113.0/24'];
    });

    it('accepts a request from inside the list', async () => {
      await expect(validate({ sub: U1, organizationId: 'org1', role: 'recruiter', sid: SID }, '203.0.113.77')).resolves.toBeDefined();
    });

    it('refuses a live session from outside the list with 403', async () => {
      await expect(validate({ sub: U1, organizationId: 'org1', role: 'recruiter', sid: SID }, '192.0.2.1')).rejects.toThrow(ForbiddenException);
    });

    it('applies to an impersonator too', async () => {
      await expect(
        validate({ sub: U1, organizationId: 'org1', role: 'recruiter', impersonatorUserId: ADMIN, sid: SID }, '192.0.2.1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('does not bind platform staff acting inside the company', async () => {
      await expect(
        validate({ sub: ADMIN, organizationId: 'org1', role: 'super_admin', actingSuperAdmin: true, sid: SID }, '192.0.2.1'),
      ).resolves.toBeDefined();
    });

    it('checks the session first: a dead session is 401 regardless of network', async () => {
      sessionLive(false);
      await expect(validate({ sub: U1, organizationId: 'org1', role: 'recruiter', sid: SID }, '192.0.2.1')).rejects.toThrow(UnauthorizedException);
    });
  });

  it('checks an impersonation token against the impersonator session, not the target', async () => {
    await validate({ sub: U1, organizationId: 'org1', role: 'recruiter', impersonatorUserId: ADMIN, sid: SID });
    const tx = { $queryRaw: jest.fn().mockResolvedValue([{ n: 1 }]) };
    await tenantPrisma.forTenant.mock.calls[0][1](tx);
    expect(tenantPrisma.forTenant.mock.calls[0][0]).toEqual({ organizationId: null, isSuperAdmin: true });
    const values = tx.$queryRaw.mock.calls[0].slice(1);
    expect(values).toEqual(expect.arrayContaining([SID, ADMIN]));
    expect(values).not.toContain(U1);
  });
});
