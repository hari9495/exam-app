import { Test } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PrismaService } from '@exam-platform/shared';
import { createHash } from 'crypto';

describe('AuthController.ssoExchange', () => {
  let controller: AuthController;
  let authService: { issueTokensForSso: jest.Mock };
  let prisma: { ssoLoginCode: { findUnique: jest.Mock; delete: jest.Mock } };

  beforeEach(async () => {
    authService = { issueTokensForSso: jest.fn() };
    prisma = { ssoLoginCode: { findUnique: jest.fn(), delete: jest.fn() } };
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    controller = moduleRef.get(AuthController);
  });

  it('exchanges a valid unexpired code for a token pair and deletes the code', async () => {
    const codeHash = createHash('sha256').update('raw-code-123').digest('hex');
    prisma.ssoLoginCode.findUnique.mockResolvedValue({
      id: 'code-row-1', codeHash, userId: 'user-1', expiresAt: new Date(Date.now() + 30_000),
      user: { id: 'user-1', organizationId: 'org-1', role: 'recruiter' },
    });
    authService.issueTokensForSso.mockResolvedValue({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    const res = { cookie: jest.fn() };

    const result = await controller.ssoExchange({ code: 'raw-code-123' }, res as any);

    expect(result).toEqual({ accessToken: 'access-1' });
    expect(authService.issueTokensForSso).toHaveBeenCalledWith('user-1', 'org-1', 'recruiter');
    expect(prisma.ssoLoginCode.delete).toHaveBeenCalledWith({ where: { id: 'code-row-1' } });
    expect(res.cookie).toHaveBeenCalledWith('refresh_token', 'refresh-1', { httpOnly: true, sameSite: 'lax', secure: false });
  });

  it('rejects an expired code with 401 and still deletes it', async () => {
    const codeHash = createHash('sha256').update('raw-code-123').digest('hex');
    prisma.ssoLoginCode.findUnique.mockResolvedValue({
      id: 'code-row-1', codeHash, userId: 'user-1', expiresAt: new Date(Date.now() - 1000), user: { id: 'user-1', organizationId: 'org-1', role: 'recruiter' },
    });
    const res = { cookie: jest.fn() };

    await expect(controller.ssoExchange({ code: 'raw-code-123' }, res as any)).rejects.toThrow();
    expect(prisma.ssoLoginCode.delete).toHaveBeenCalledWith({ where: { id: 'code-row-1' } });
  });

  it('rejects an unknown code with 401', async () => {
    prisma.ssoLoginCode.findUnique.mockResolvedValue(null);
    const res = { cookie: jest.fn() };

    await expect(controller.ssoExchange({ code: 'not-real' }, res as any)).rejects.toThrow();
  });
});
