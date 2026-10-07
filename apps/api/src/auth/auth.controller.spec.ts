import { Test } from '@nestjs/testing';
import { RefreshThrottlerGuard } from './refresh-throttler.guard';
import { CredentialThrottlerGuard } from './credential-throttler.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionsService } from './sessions.service';
import { CompanyScopeService } from './company-scope';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { createHash } from 'crypto';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describe('AuthController.ssoExchange', () => {
  let controller: AuthController;
  let authService: { issueTokensForSso: jest.Mock; logout: jest.Mock };
  let prisma: {
    organization: { findUnique: jest.Mock };
    ssoLoginCode: { findUnique: jest.Mock; deleteMany: jest.Mock };
  };
  let tenantPrisma: { forTenant: jest.Mock };
  let sessions: { recordLoginEvent: jest.Mock };
  // The browser that started the sign-in: its device cookie is what the code is bound to.
  const DEVICE = 'D'.repeat(43);
  const req = { cookies: { yx_device: DEVICE }, ip: '203.0.113.7', get: () => 'jest-agent' } as any;
  const codeRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'code-row-1',
    codeHash: sha256('raw-code-123'),
    userId: 'user-1',
    expiresAt: new Date(Date.now() + 30_000),
    method: 'oidc',
    mfaAsserted: true,
    identityProviderId: 'idp-1',
    deviceIdHash: sha256(DEVICE),
    ...overrides,
  });

  beforeEach(async () => {
    sessions = { recordLoginEvent: jest.fn().mockResolvedValue(undefined) };
    authService = { issueTokensForSso: jest.fn(), logout: jest.fn() };
    prisma = {
      organization: { findUnique: jest.fn().mockResolvedValue({ id: 'org-1', status: 'active' }) },
      ssoLoginCode: { findUnique: jest.fn(), deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    tenantPrisma = { forTenant: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: PrismaService, useValue: prisma },
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: SessionsService, useValue: sessions },
        { provide: CompanyScopeService, useValue: { slugFor: jest.fn(async (_req: unknown, slug?: string) => slug) } },
      ],
    })
      .overrideGuard(RefreshThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CredentialThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(AuthController);
  });

  it('exchanges a valid unexpired code from the browser that started it, and deletes the code', async () => {
    prisma.ssoLoginCode.findUnique.mockResolvedValue(codeRow());
    tenantPrisma.forTenant.mockResolvedValue({ id: 'user-1', email: 'U1@x.test', organizationId: 'org-1', role: 'recruiter', status: 'active' });
    authService.issueTokensForSso.mockResolvedValue({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    const res = { cookie: jest.fn() };

    const result = await controller.ssoExchange({ code: 'raw-code-123' }, req, res as any);

    expect(result).toEqual({ accessToken: 'access-1' });
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith({ organizationId: null, isSuperAdmin: true }, expect.any(Function));
    expect(authService.issueTokensForSso).toHaveBeenCalledWith(
      { id: 'user-1', email: 'U1@x.test', organizationId: 'org-1', role: 'recruiter', permissionProfileId: null },
      expect.objectContaining({ ip: '203.0.113.7', userAgent: 'jest-agent', deviceId: DEVICE }),
      // How the IdP signed the person in, and which IdP, travel with the code.
      { method: 'oidc', mfaAsserted: true, identityProviderId: 'idp-1' },
    );
    expect(prisma.ssoLoginCode.deleteMany).toHaveBeenCalledWith({ where: { id: 'code-row-1' } });
    // secure: true is the assertion that matters. This previously pinned `secure: false` --
    // the value that shipped a session cookie without the Secure flag to production.
    expect(res.cookie).toHaveBeenCalledWith('refresh_token', 'refresh-1', { httpOnly: true, sameSite: 'lax', secure: true });
  });

  // Regression (login CSRF): an attacker finishes SSO for their own account and gets the victim's
  // browser to redeem the code. The code is bound to the attacker's device cookie, so it fails.
  it('refuses a code redeemed by another browser (different device cookie), and burns it', async () => {
    prisma.ssoLoginCode.findUnique.mockResolvedValue(codeRow());
    const victim = { ...req, cookies: { yx_device: 'V'.repeat(43) } };

    await expect(controller.ssoExchange({ code: 'raw-code-123' }, victim, { cookie: jest.fn() } as any)).rejects.toThrow('invalid or has expired');
    expect(prisma.ssoLoginCode.deleteMany).toHaveBeenCalled();
    expect(authService.issueTokensForSso).not.toHaveBeenCalled();
    expect(sessions.recordLoginEvent).toHaveBeenCalledWith(expect.objectContaining({ result: 'failed', reason: 'sso_device_mismatch' }));
  });

  it('refuses a code from a browser with no device cookie at all (a fresh one is minted, it cannot match)', async () => {
    prisma.ssoLoginCode.findUnique.mockResolvedValue(codeRow());
    const res = { cookie: jest.fn() };
    await expect(controller.ssoExchange({ code: 'raw-code-123' }, { ...req, cookies: {} }, res as any)).rejects.toThrow();
    expect(res.cookie).toHaveBeenCalledWith('yx_device', expect.any(String), expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'lax' }));
    expect(authService.issueTokensForSso).not.toHaveBeenCalled();
  });

  it('refuses a code that was minted without a device binding', async () => {
    prisma.ssoLoginCode.findUnique.mockResolvedValue(codeRow({ deviceIdHash: null }));
    await expect(controller.ssoExchange({ code: 'raw-code-123' }, req, { cookie: jest.fn() } as any)).rejects.toThrow();
    expect(authService.issueTokensForSso).not.toHaveBeenCalled();
  });

  it('of two concurrent redemptions of one code, only the one that deletes it proceeds (replay)', async () => {
    prisma.ssoLoginCode.findUnique.mockResolvedValue(codeRow());
    prisma.ssoLoginCode.deleteMany.mockResolvedValue({ count: 0 });
    await expect(controller.ssoExchange({ code: 'raw-code-123' }, req, { cookie: jest.fn() } as any)).rejects.toThrow();
    expect(authService.issueTokensForSso).not.toHaveBeenCalled();
  });

  it('clears the refresh cookie with the SAME attributes it was set with', async () => {
    // A browser only honours a clearing Set-Cookie whose attributes match the original. Once
    // the cookie became Secure, a bare res.clearCookie(name) was silently ignored and logout
    // left the session cookie in place -- verified live against production before this fix.
    const res = { cookie: jest.fn(), clearCookie: jest.fn() };
    const logoutReq = { cookies: { refresh_token: 'refresh-1' } };

    await controller.logout({} as any, logoutReq as any, res as any);

    expect(authService.logout).toHaveBeenCalledWith('refresh-1');
    expect(res.clearCookie).toHaveBeenCalledWith('refresh_token', { httpOnly: true, sameSite: 'lax', secure: true });
  });

  it('sets the refresh cookie Secure regardless of NODE_ENV', async () => {
    // Pins the fix for the audit finding: the flag must not depend on NODE_ENV, which is
    // unset in production and made the previous candidate-cookie guard evaluate false there.
    const savedNodeEnv = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    try {
      prisma.ssoLoginCode.findUnique.mockResolvedValue(codeRow());
      tenantPrisma.forTenant.mockResolvedValue({ id: 'user-1', email: 'U1@x.test', organizationId: 'org-1', role: 'recruiter', status: 'active' });
      authService.issueTokensForSso.mockResolvedValue({ accessToken: 'access-1', refreshToken: 'refresh-1' });
      const res = { cookie: jest.fn() };
      await controller.ssoExchange({ code: 'raw-code-123' }, req, res as any);
      expect(res.cookie).toHaveBeenCalledWith('refresh_token', 'refresh-1', expect.objectContaining({ secure: true }));
    } finally {
      if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = savedNodeEnv;
    }
  });

  it('rejects an expired code with 401 and still deletes it', async () => {
    prisma.ssoLoginCode.findUnique.mockResolvedValue(codeRow({ expiresAt: new Date(Date.now() - 1000) }));
    const res = { cookie: jest.fn() };

    await expect(controller.ssoExchange({ code: 'raw-code-123' }, req, res as any)).rejects.toThrow();
    expect(prisma.ssoLoginCode.deleteMany).toHaveBeenCalledWith({ where: { id: 'code-row-1' } });
    expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
  });

  it('rejects an unknown code with 401', async () => {
    prisma.ssoLoginCode.findUnique.mockResolvedValue(null);
    const res = { cookie: jest.fn() };

    await expect(controller.ssoExchange({ code: 'not-real' }, req, res as any)).rejects.toThrow();
    // The failed attempt is still recorded (YX-IAM-10).
    expect(sessions.recordLoginEvent).toHaveBeenCalledWith(expect.objectContaining({ result: 'failed', method: 'saml', reason: 'invalid_sso_code' }));
  });

  it('records a failed SSO attempt for a deactivated account and issues nothing', async () => {
    prisma.ssoLoginCode.findUnique.mockResolvedValue(codeRow());
    tenantPrisma.forTenant.mockResolvedValue({ id: 'user-1', email: 'u@x.test', organizationId: 'org-1', role: 'recruiter', status: 'deactivated' });

    await expect(controller.ssoExchange({ code: 'raw-code-123' }, req, { cookie: jest.fn() } as any)).rejects.toThrow('deactivated');
    expect(authService.issueTokensForSso).not.toHaveBeenCalled();
    expect(sessions.recordLoginEvent).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1', result: 'failed', reason: 'account_inactive' }));
  });

  it('rejects with 401 when the code is valid but the referenced user no longer exists', async () => {
    prisma.ssoLoginCode.findUnique.mockResolvedValue(codeRow());
    tenantPrisma.forTenant.mockResolvedValue(null);
    const res = { cookie: jest.fn() };

    await expect(controller.ssoExchange({ code: 'raw-code-123' }, req, res as any)).rejects.toThrow();
    expect(authService.issueTokensForSso).not.toHaveBeenCalled();
  });
});
