import { Test } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { createHash } from 'crypto';

describe('AuthController.ssoExchange', () => {
  let controller: AuthController;
  let authService: { issueTokensForSso: jest.Mock };
  let prisma: {
    organization: { findUnique: jest.Mock }; ssoLoginCode: { findUnique: jest.Mock; delete: jest.Mock } };
  let tenantPrisma: { forTenant: jest.Mock };

  beforeEach(async () => {
    authService = { issueTokensForSso: jest.fn() };
    prisma = {
      organization: { findUnique: jest.fn().mockResolvedValue({ id: 'org-1', status: 'active' }) }, ssoLoginCode: { findUnique: jest.fn(), delete: jest.fn() } };
    tenantPrisma = { forTenant: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: PrismaService, useValue: prisma },
        { provide: TenantPrismaService, useValue: tenantPrisma },
      ],
    }).compile();
    controller = moduleRef.get(AuthController);
  });

  it('exchanges a valid unexpired code for a token pair and deletes the code', async () => {
    const codeHash = createHash('sha256').update('raw-code-123').digest('hex');
    prisma.ssoLoginCode.findUnique.mockResolvedValue({
      id: 'code-row-1', codeHash, userId: 'user-1', expiresAt: new Date(Date.now() + 30_000),
    });
    tenantPrisma.forTenant.mockResolvedValue({ id: 'user-1', organizationId: 'org-1', role: 'recruiter', status: 'active' });
    authService.issueTokensForSso.mockResolvedValue({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    const res = { cookie: jest.fn() };

    const result = await controller.ssoExchange({ code: 'raw-code-123' }, res as any);

    expect(result).toEqual({ accessToken: 'access-1' });
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith({ organizationId: null, isSuperAdmin: true }, expect.any(Function));
    expect(authService.issueTokensForSso).toHaveBeenCalledWith('user-1', 'org-1', 'recruiter');
    expect(prisma.ssoLoginCode.delete).toHaveBeenCalledWith({ where: { id: 'code-row-1' } });
    // secure: true is the assertion that matters. This previously pinned `secure: false` --
    // the value that shipped a session cookie without the Secure flag to production.
    expect(res.cookie).toHaveBeenCalledWith('refresh_token', 'refresh-1', { httpOnly: true, sameSite: 'lax', secure: true });
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
      tenantPrisma.forTenant.mockResolvedValue({ id: 'user-1', organizationId: 'org-1', role: 'recruiter', status: 'active' });
      authService.issueTokensForSso.mockResolvedValue({ accessToken: 'access-1', refreshToken: 'refresh-1' });
      const res = { cookie: jest.fn() };
      await controller.ssoExchange({ code: 'raw-code-123' }, res as any);
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

    await expect(controller.ssoExchange({ code: 'raw-code-123' }, res as any)).rejects.toThrow();
    expect(prisma.ssoLoginCode.delete).toHaveBeenCalledWith({ where: { id: 'code-row-1' } });
    expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
  });

  it('rejects an unknown code with 401', async () => {
    prisma.ssoLoginCode.findUnique.mockResolvedValue(null);
    const res = { cookie: jest.fn() };

    await expect(controller.ssoExchange({ code: 'not-real' }, res as any)).rejects.toThrow();
  });

  it('rejects with 401 when the code is valid but the referenced user no longer exists', async () => {
    const codeHash = createHash('sha256').update('raw-code-123').digest('hex');
    prisma.ssoLoginCode.findUnique.mockResolvedValue({
      id: 'code-row-1', codeHash, userId: 'user-1', expiresAt: new Date(Date.now() + 30_000),
    });
    tenantPrisma.forTenant.mockResolvedValue(null);
    const res = { cookie: jest.fn() };

    await expect(controller.ssoExchange({ code: 'raw-code-123' }, res as any)).rejects.toThrow();
    expect(authService.issueTokensForSso).not.toHaveBeenCalled();
  });
});
