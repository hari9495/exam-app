import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { PrismaService } from '@exam-platform/shared';
import { TenantPrismaService } from '@exam-platform/shared';
import { AuditService } from '@exam-platform/shared';
import { EmailService } from '../email/email.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    organization: { findUnique: jest.Mock };
    refreshToken: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    user: { findUnique: jest.Mock };
    passwordResetToken: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  let emailService: { send: jest.Mock };
  let jwt: JwtService;

  beforeEach(async () => {
    prisma = {
      organization: { findUnique: jest.fn() },
      refreshToken: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      user: { findUnique: jest.fn() },
      passwordResetToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      $transaction: jest.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
    };
    tenantPrisma = { forTenant: jest.fn() };
    audit = { record: jest.fn() };
    emailService = { send: jest.fn().mockResolvedValue({ success: true }) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AuditService, useValue: audit },
        { provide: EmailService, useValue: emailService },
        JwtService,
      ],
    }).compile();

    service = moduleRef.get(AuthService);
    jwt = moduleRef.get(JwtService);
    process.env.JWT_ACCESS_SECRET = 'test-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  });

  it('rejects login when the org slug does not resolve', async () => {
    prisma.organization.findUnique.mockResolvedValue(null);

    await expect(
      service.login({ organizationSlug: 'no-such-org', email: 'a@b.com', password: 'x' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects login on a wrong password', async () => {
    const passwordHash = await argon2.hash('correct-password');
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-1' });
    tenantPrisma.forTenant.mockResolvedValue({
      id: 'user-1', organizationId: 'org-1', role: 'org_admin', passwordHash,
    });

    await expect(
      service.login({ organizationSlug: 'demo-org', email: 'admin@demo-org.test', password: 'wrong-password' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('issues an access and refresh token on correct credentials', async () => {
    const passwordHash = await argon2.hash('correct-password');
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-1' });
    tenantPrisma.forTenant.mockResolvedValueOnce({
      id: 'user-1', organizationId: 'org-1', role: 'org_admin', passwordHash,
    });
    tenantPrisma.forTenant.mockResolvedValueOnce(undefined);
    prisma.refreshToken.create.mockResolvedValue({});

    const result = await service.login({
      organizationSlug: 'demo-org', email: 'admin@demo-org.test', password: 'correct-password',
    });

    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toEqual(expect.any(String));
    const decoded = jwt.decode(result.accessToken) as { organizationId: string; role: string };
    expect(decoded.organizationId).toBe('org-1');
    expect(decoded.role).toBe('org_admin');
  });

  it('revokes the whole refresh-token family and audits the incident on reuse detection', async () => {
    const refreshToken = jwt.sign({ sub: 'user-1', familyId: 'family-1' }, { secret: process.env.JWT_REFRESH_SECRET });
    prisma.refreshToken.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', organizationId: 'org-1', role: 'org_admin' });

    await expect(service.refresh(refreshToken)).rejects.toThrow(UnauthorizedException);

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', familyId: 'family-1' },
      data: { revokedAt: expect.any(Date) },
    });
    expect(audit.record).toHaveBeenCalledWith(
      { organizationId: 'org-1', isSuperAdmin: false },
      { actorUserId: 'user-1', action: 'auth.token_reuse_detected', entityType: 'user', entityId: 'user-1' },
    );
  });

  it('audits reuse detection with isSuperAdmin: true when the token\'s user no longer exists', async () => {
    // organizationId: null with isSuperAdmin: false is unwritable under this table's RLS
    // block predicate (NULL = NULL is UNKNOWN in SQL, never TRUE) -- this must route
    // through the super_admin bypass instead, or the audit write always fails.
    const refreshToken = jwt.sign({ sub: 'ghost-user', familyId: 'family-1' }, { secret: process.env.JWT_REFRESH_SECRET });
    prisma.refreshToken.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.refresh(refreshToken)).rejects.toThrow(UnauthorizedException);

    expect(audit.record).toHaveBeenCalledWith(
      { organizationId: null, isSuperAdmin: true },
      { actorUserId: 'ghost-user', action: 'auth.token_reuse_detected', entityType: 'user', entityId: 'ghost-user' },
    );
  });

  it('still throws UnauthorizedException (not a 500) when the reuse-detection audit write itself fails', async () => {
    const refreshToken = jwt.sign({ sub: 'user-1', familyId: 'family-1' }, { secret: process.env.JWT_REFRESH_SECRET });
    prisma.refreshToken.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', organizationId: 'org-1', role: 'org_admin' });
    audit.record.mockRejectedValue(new Error('DB unavailable'));

    await expect(service.refresh(refreshToken)).rejects.toThrow(UnauthorizedException);
  });

  describe('forgotPassword', () => {
    it('creates a hashed reset token and emails a link when the org and user match', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', slug: 'demo-org' });
      tenantPrisma.forTenant.mockResolvedValue({ id: 'user-1', email: 'admin@demo-org.test', organizationId: 'org-1' });
      prisma.passwordResetToken.create.mockResolvedValue({});

      await service.forgotPassword({ organizationSlug: 'demo-org', email: 'admin@demo-org.test' });

      expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
      const createCall = prisma.passwordResetToken.create.mock.calls[0][0];
      expect(createCall.data.userId).toBe('user-1');
      expect(createCall.data.tokenHash).toEqual(expect.any(String));
      expect(createCall.data.tokenHash).not.toBe(''); // a hash was computed, not the raw token stored directly
      expect(createCall.data.expiresAt.getTime()).toBeGreaterThan(Date.now());

      // Email dispatch is fire-and-forget; give the microtask queue a tick to run it.
      await new Promise((resolve) => setImmediate(resolve));
      expect(emailService.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'admin@demo-org.test', subject: expect.any(String) }),
      );
    });

    it('does not create a token or send an email when the org slug does not resolve, and does not throw', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);

      await expect(
        service.forgotPassword({ organizationSlug: 'no-such-org', email: 'a@b.com' }),
      ).resolves.toBeUndefined();

      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(emailService.send).not.toHaveBeenCalled();
    });

    it('does not create a token or send an email when the email does not match a user in that org, and does not throw', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', slug: 'demo-org' });
      tenantPrisma.forTenant.mockResolvedValue(null);

      await expect(
        service.forgotPassword({ organizationSlug: 'demo-org', email: 'nobody@demo-org.test' }),
      ).resolves.toBeUndefined();

      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(emailService.send).not.toHaveBeenCalled();
    });
  });
});
