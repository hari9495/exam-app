import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy.validate', () => {
  const SID = '22222222-2222-4222-8222-222222222222';
  const U1 = '11111111-1111-4111-8111-111111111111';
  const ADMIN = '33333333-3333-4333-8333-333333333333';
  let strategy: JwtStrategy;
  let tenantPrisma: { forTenant: jest.Mock };
  const sessionLive = (live: boolean) => tenantPrisma.forTenant.mockResolvedValue([{ n: live ? 1 : 0 }]);

  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = 'test-secret';
  });

  beforeEach(() => {
    tenantPrisma = { forTenant: jest.fn() };
    sessionLive(true);
    strategy = new JwtStrategy(tenantPrisma as any);
  });

  it('passes impersonation claims and the session id through to the request user', async () => {
    const user = await strategy.validate({
      sub: U1, organizationId: 'org1', role: 'recruiter',
      impersonatorUserId: ADMIN, impersonatorEmail: 'admin@x.com', sid: SID,
    });
    expect(user).toEqual(expect.objectContaining({
      userId: U1, role: 'recruiter', impersonatorUserId: ADMIN, impersonatorEmail: 'admin@x.com', sessionId: SID,
    }));
  });

  it('leaves impersonation claims undefined for a normal token', async () => {
    const user = await strategy.validate({ sub: U1, organizationId: 'org1', role: 'org_admin', sid: SID });
    expect(user.impersonatorUserId).toBeUndefined();
  });

  it('surfaces permissionProfileId on the request user', async () => {
    const user = await strategy.validate({ sub: U1, organizationId: 'org1', role: 'recruiter', permissionProfileId: 'profile-1', sid: SID });
    expect(user.permissionProfileId).toBe('profile-1');
  });

  it('defaults permissionProfileId to null when the claim is absent', async () => {
    const user = await strategy.validate({ sub: U1, organizationId: 'org1', role: 'recruiter', sid: SID });
    expect(user.permissionProfileId).toBeNull();
  });

  it('rejects a validly signed token whose session is revoked, expired or idle (YX-IAM-06)', async () => {
    sessionLive(false);
    await expect(strategy.validate({ sub: U1, organizationId: 'org1', role: 'recruiter', sid: SID })).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a pre-sessions token with no sid without a database round trip', async () => {
    await expect(strategy.validate({ sub: U1, organizationId: 'org1', role: 'recruiter' })).rejects.toThrow(UnauthorizedException);
    expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
  });

  it('rejects a malformed sid without a database round trip', async () => {
    await expect(
      strategy.validate({ sub: U1, organizationId: 'org1', role: 'recruiter', sid: "x' OR 1=1 --" }),
    ).rejects.toThrow(UnauthorizedException);
    expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
  });

  it('checks an impersonation token against the impersonator session, not the target', async () => {
    await strategy.validate({ sub: U1, organizationId: 'org1', role: 'recruiter', impersonatorUserId: ADMIN, sid: SID });
    const tx = { $queryRaw: jest.fn().mockResolvedValue([{ n: 1 }]) };
    await tenantPrisma.forTenant.mock.calls[0][1](tx);
    expect(tenantPrisma.forTenant.mock.calls[0][0]).toEqual({ organizationId: null, isSuperAdmin: true });
    const values = tx.$queryRaw.mock.calls[0].slice(1);
    expect(values).toEqual(expect.arrayContaining([SID, ADMIN]));
    expect(values).not.toContain(U1);
  });
});
