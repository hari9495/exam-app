import { Test } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionsService } from './sessions.service';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { createHash } from 'crypto';

describe('AuthController.ssoExchange', () => {
  let controller: AuthController;
  let authService: { issueTokensForSso: jest.Mock; logout: jest.Mock };
  let prisma: {
    organization: { findUnique: jest.Mock }; ssoLoginCode: { findUnique: jest.Mock; delete: jest.Mock } };
  let tenantPrisma: { forTenant: jest.Mock };
  let sessions: { recordLoginEvent: jest.Mock };
  const req = { cookies: {}, ip: '203.0.113.7', get: () => 'jest-agent' } as any;

  beforeEach(async () => {
    sessions = { recordLoginEvent: jest.fn().mockResolvedValue(undefined) };
    authService = { issueTokensForSso: jest.fn(), logout: jest.fn() };
    prisma = {
      organization: { findUnique: jest.fn().mockResolvedValue({ id: 'org-1', status: 'active' }) }, ssoLoginCode: { findUnique: jest.fn(), delete: jest.fn() } };
    tenantPrisma = { forTenant: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: PrismaService, useValue: prisma },
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: SessionsService, useValue: sessions },
      ],
    }).compile();
    controller = moduleRef.get(AuthController);
  });

  it('exchanges a valid unexpired code for a token pair and deletes the code', async () => {
    const codeHash = createHash('sha256').update('raw-code-123').digest('hex');
    prisma.ssoLoginCode.findUnique.mockResolvedValue({
      id: 'code-row-1', codeHash, userId: 'user-1', expiresAt: new Date(Date.now() + 30_000), method: 'oidc', mfaAsserted: true,
    });
    tenantPrisma.forTenant.mockResolvedValue({ id: 'user-1', email: 'U1@x.test', organizationId: 'org-1', role: 'recruiter', status: 'active' });
    authService.issueTokensForSso.mockResolvedValue({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    const res = { cookie: jest.fn() };

    const result = await controller.ssoExchange({ code: 'raw-code-123' }, req, res as any);

    expect(result).toEqual({ accessToken: 'access-1' });
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith({ organizationId: null, isSuperAdmin: true }, expect.any(Function));
    expect(authService.issueTokensForSso).toHaveBeenCalledWith(
      { id: 'user-1', email: 'U1@x.test', organizationId: 'org-1', role: 'recruiter', permissionProfileId: null },
      expect.objectContaining({ ip: '203.0.113.7', userAgent: 'jest-agent', deviceId: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) }),
      // How the IdP signed the person in travels with the code (AAL2 only when it asserted MFA).
      { method: 'oidc', mfaAsserted: true },
    );
    // No device cookie on the request => one is minted, HttpOnly + Secure like the refresh cookie.
    expect(res.cookie).toHaveBeenCalledWith('yx_device', expect.any(String), expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'lax' }));
    expect(prisma.ssoLoginCode.delete).toHaveBeenCalledWith({ where: { id: 'code-row-1' } });
    // secure: true is the assertion that matters. This previously pinned `secure: false` --
    // the value that shipped a session cookie without the Secure flag to production.
    expect(res.cookie).toHaveBeenCalledWith('refresh_token', 'refresh-1', { httpOnly: true, sameSite: 'lax', secure: true });
  });

  it('clears the refresh cookie with the SAME attributes it was set with', async () => {
    // A browser only honours a clearing Set-Cookie whose attributes match the original. Once
    // the cookie became Secure, a bare res.clearCookie(name) was silently ignored and logout
    // left the session cookie in place -- verified live against production before this fix.
    const res = { cookie: jest.fn(), clearCookie: jest.fn() };
    const req = { cookies: { refresh_token: 'refresh-1' } };

    await controller.logout({} as any, req as any, res as any);

    expect(authService.logout).toHaveBeenCalledWith('refresh-1');
    expect(res.clearCookie).toHaveBeenCalledWith('refresh_token', { httpOnly: true, sameSite: 'lax', secure: true });
  });

  it('sets the refresh cookie Secure regardless of NODE_ENV', async () => {
    // Pins the fix for the audit finding: the flag must not depend on NODE_ENV, which is
    // unset in production and made the previous candidate-cookie guard evaluate false there.
    const savedNodeEnv = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    try {
      const codeHash = createHash('sha256').update('raw-code-123').digest('hex');
      prisma.ssoLoginCode.findUnique.mockResolvedValue({
        id: 'code-row-1', codeHash, userId: 'user-1', expiresAt: new Date(Date.now() + 30_000),
      });
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
    const codeHash = createHash('sha256').update('raw-code-123').digest('hex');
    prisma.ssoLoginCode.findUnique.mockResolvedValue({
      id: 'code-row-1', codeHash, userId: 'user-1', expiresAt: new Date(Date.now() - 1000),
    });
    const res = { cookie: jest.fn() };

    await expect(controller.ssoExchange({ code: 'raw-code-123' }, req, res as any)).rejects.toThrow();
    expect(prisma.ssoLoginCode.delete).toHaveBeenCalledWith({ where: { id: 'code-row-1' } });
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
    const codeHash = createHash('sha256').update('raw-code-123').digest('hex');
    prisma.ssoLoginCode.findUnique.mockResolvedValue({ id: 'c', codeHash, userId: 'user-1', expiresAt: new Date(Date.now() + 30_000) });
    tenantPrisma.forTenant.mockResolvedValue({ id: 'user-1', email: 'u@x.test', organizationId: 'org-1', role: 'recruiter', status: 'deactivated' });

    await expect(controller.ssoExchange({ code: 'raw-code-123' }, req, { cookie: jest.fn() } as any)).rejects.toThrow('deactivated');
    expect(authService.issueTokensForSso).not.toHaveBeenCalled();
    expect(sessions.recordLoginEvent).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1', result: 'failed', reason: 'account_inactive' }));
  });

  it('rejects with 401 when the code is valid but the referenced user no longer exists', async () => {
    const codeHash = createHash('sha256').update('raw-code-123').digest('hex');
    prisma.ssoLoginCode.findUnique.mockResolvedValue({
      id: 'code-row-1', codeHash, userId: 'user-1', expiresAt: new Date(Date.now() + 30_000),
    });
    tenantPrisma.forTenant.mockResolvedValue(null);
    const res = { cookie: jest.fn() };

    await expect(controller.ssoExchange({ code: 'raw-code-123' }, req, res as any)).rejects.toThrow();
    expect(authService.issueTokensForSso).not.toHaveBeenCalled();
  });
});
