import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHash } from 'crypto';
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
    user: { findUnique: jest.Mock; update: jest.Mock };
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
      user: { findUnique: jest.fn(), update: jest.fn() },
      passwordResetToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      $transaction: jest.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
    };
    // Default: actually invoke the callback against the same `prisma` mock, mirroring
    // the $transaction mock above -- otherwise tests that rely on tenantPrisma.forTenant
    // running its callback (e.g. resetPassword's RLS-safe writes) would vacuously pass
    // without exercising the tx.user.update/etc. calls at all. Tests that need forTenant
    // to resolve directly to a value (login, forgotPassword) override this per-call via
    // mockResolvedValue(Once).
    tenantPrisma = { forTenant: jest.fn(async (_context: unknown, fn: (tx: unknown) => unknown) => fn(prisma)) };
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

  it('revokes the whole refresh-token family and audits the incident, attributed to the compromised user\'s real org, on reuse detection', async () => {
    const refreshToken = jwt.sign({ sub: 'user-1', familyId: 'family-1' }, { secret: process.env.JWT_REFRESH_SECRET });
    prisma.refreshToken.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', organizationId: 'org-1', role: 'org_admin' });

    await expect(service.refresh(refreshToken)).rejects.toThrow(UnauthorizedException);

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', familyId: 'family-1' },
      data: { revokedAt: expect.any(Date) },
    });
    // The compromised-user lookup must go through forTenant's super_admin bypass, not
    // the raw client -- `users` is RLS-protected, so a bare findUnique would silently
    // match zero rows and this would always fall through to the null/org-less branch,
    // misattributing every reuse-detection audit entry away from the real tenant.
    expect(tenantPrisma.forTenant).toHaveBeenCalledTimes(1);
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith(
      { organizationId: null, isSuperAdmin: true },
      expect.any(Function),
    );
    expect(audit.record).toHaveBeenCalledWith(
      { organizationId: 'org-1', isSuperAdmin: false },
      { actorUserId: 'user-1', action: 'auth.token_reuse_detected', entityType: 'user', entityId: 'user-1' },
    );
  });

  it('audits reuse detection with isSuperAdmin: true when the token\'s user is genuinely absent', async () => {
    // organizationId: null with isSuperAdmin: false is unwritable under this table's RLS
    // block predicate (NULL = NULL is UNKNOWN in SQL, never TRUE) -- this must route
    // through the super_admin bypass instead, or the audit write always fails.
    const refreshToken = jwt.sign({ sub: 'ghost-user', familyId: 'family-1' }, { secret: process.env.JWT_REFRESH_SECRET });
    prisma.refreshToken.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.refresh(refreshToken)).rejects.toThrow(UnauthorizedException);

    expect(tenantPrisma.forTenant).toHaveBeenCalledTimes(1);
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith(
      { organizationId: null, isSuperAdmin: true },
      expect.any(Function),
    );
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

    await expect(service.refresh(refreshToken)).rejects.toThrow('Refresh token reuse detected — session revoked');
  });

  it('still throws the same 401 (not a 503) when the compromised-user forTenant lookup itself throws', async () => {
    // The lookup is now a multi-statement RLS-bypass transaction, so it can fail on its
    // own (e.g. a P2028 transaction timeout) independently of the audit write. The family
    // has already been revoked by this point, so nothing security-critical is lost by
    // swallowing this and still returning the 401 -- exactly the path an attacker replays
    // in bursts, so it must never surface as a 500/503 instead.
    const refreshToken = jwt.sign({ sub: 'user-1', familyId: 'family-1' }, { secret: process.env.JWT_REFRESH_SECRET });
    prisma.refreshToken.findFirst.mockResolvedValue(null);
    tenantPrisma.forTenant.mockRejectedValue(new Error('P2028: Transaction timed out'));

    await expect(service.refresh(refreshToken)).rejects.toThrow('Refresh token reuse detected — session revoked');
    expect(audit.record).not.toHaveBeenCalled();
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

      // Verify the token stored in the DB is actually a sha256 hash of the raw token sent in the email.
      const emailCall = emailService.send.mock.calls[0][0];
      const htmlContent = emailCall.html as string;
      const tokenMatch = htmlContent.match(/\/reset-password\/([a-f0-9]+)/);
      expect(tokenMatch).not.toBeNull();
      const rawToken = tokenMatch![1];
      const computedHash = createHash('sha256').update(rawToken).digest('hex');
      expect(computedHash).toBe(createCall.data.tokenHash);
    });

    it("passes the organization's id through to EmailService.send so org-specific SMTP can be used", async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', slug: 'demo-org' });
      tenantPrisma.forTenant.mockResolvedValue({ id: 'user-1', email: 'admin@demo-org.test', organizationId: 'org-1' });
      prisma.passwordResetToken.create.mockResolvedValue({});

      await service.forgotPassword({ organizationSlug: 'demo-org', email: 'admin@demo-org.test' });
      await new Promise((resolve) => setImmediate(resolve));

      expect(emailService.send).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 'org-1' }));
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

  describe('resetPassword', () => {
    it('rejects a token that does not exist', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(
        service.resetPassword({ token: 'no-such-token', newPassword: 'NewPassw0rd!' }),
      ).rejects.toThrow('This reset link is invalid or has expired');
    });

    it('rejects an expired token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'prt-1', userId: 'user-1', usedAt: null, expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        service.resetPassword({ token: 'raw-token', newPassword: 'NewPassw0rd!' }),
      ).rejects.toThrow('This reset link is invalid or has expired');
    });

    it('rejects an already-used token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'prt-1', userId: 'user-1', usedAt: new Date(), expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(
        service.resetPassword({ token: 'raw-token', newPassword: 'NewPassw0rd!' }),
      ).rejects.toThrow('This reset link is invalid or has expired');
    });

    it('updates the password, marks the token used, revokes other sessions, and audits the reset on a valid token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'prt-1', userId: 'user-1', usedAt: null, expiresAt: new Date(Date.now() + 60_000),
      });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', organizationId: 'org-1', role: 'recruiter' });

      await service.resetPassword({ token: 'raw-token', newPassword: 'NewPassw0rd!' });

      // Writes and the follow-up lookup must go through forTenant's super_admin bypass,
      // not a bare prisma.$transaction -- otherwise RLS silently drops the user.update.
      expect(tenantPrisma.forTenant).toHaveBeenCalledTimes(2);
      expect(tenantPrisma.forTenant).toHaveBeenCalledWith(
        { organizationId: null, isSuperAdmin: true },
        expect.any(Function),
      );
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { passwordHash: expect.any(String) },
      });
      // The weaker expect.any(String) check above would also pass for a hash of the
      // wrong password (or garbage) -- verify the stored hash actually verifies against
      // the newPassword that was submitted.
      const storedPasswordHash = prisma.user.update.mock.calls[0][0].data.passwordHash;
      expect(await argon2.verify(storedPasswordHash, 'NewPassw0rd!')).toBe(true);
      expect(prisma.passwordResetToken.update).toHaveBeenCalledWith({
        where: { id: 'prt-1' },
        data: { usedAt: expect.any(Date) },
      });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(audit.record).toHaveBeenCalledWith(
        { organizationId: 'org-1', isSuperAdmin: false },
        { actorUserId: 'user-1', action: 'password.reset', entityType: 'user', entityId: 'user-1' },
      );
    });
  });

  describe('issueTokensForSso', () => {
    it('issues an access/refresh token pair for the given user, matching the same shape login() produces', async () => {
      jwt.sign = jest.fn()
        .mockReturnValueOnce('signed-access-token')
        .mockReturnValueOnce('signed-refresh-token');
      prisma.refreshToken.create.mockResolvedValue({ id: 'rt-1' });

      const result = await service.issueTokensForSso('user-1', 'org-1', 'recruiter');

      expect(result).toEqual({ accessToken: 'signed-access-token', refreshToken: 'signed-refresh-token' });
      expect(jwt.sign).toHaveBeenNthCalledWith(
        1,
        { sub: 'user-1', organizationId: 'org-1', role: 'recruiter' },
        expect.objectContaining({ secret: process.env.JWT_ACCESS_SECRET }),
      );
      expect(prisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 'user-1' }) }),
      );
    });
  });

  describe('switchIntoOrg', () => {
    it('throws when the target org does not exist', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);

      await expect(service.switchIntoOrg('super-admin-1', 'no-such-org')).rejects.toThrow(NotFoundException);
    });

    it('audit-logs the switch-in against the target org and returns an acting access token', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', name: 'Acme Inc' });

      const token = await service.switchIntoOrg('super-admin-1', 'org-1');

      expect(audit.record).toHaveBeenCalledWith(
        { organizationId: 'org-1', isSuperAdmin: true },
        { actorUserId: 'super-admin-1', action: 'super_admin.org_switch_in', entityType: 'organization', entityId: 'org-1' },
      );
      const payload = jwt.verify(token, { secret: 'test-secret' }) as {
        sub: string; organizationId: string; role: string; actingSuperAdmin: boolean; actingOrgName: string;
      };
      expect(payload).toMatchObject({
        sub: 'super-admin-1', organizationId: 'org-1', role: 'super_admin', actingSuperAdmin: true, actingOrgName: 'Acme Inc',
      });
    });
  });

  describe('recordSwitchOut', () => {
    it('is a no-op when there is no org to exit', async () => {
      await service.recordSwitchOut('super-admin-1', null);

      expect(audit.record).not.toHaveBeenCalled();
    });

    it('audit-logs the switch-out against the exited org', async () => {
      await service.recordSwitchOut('super-admin-1', 'org-1');

      expect(audit.record).toHaveBeenCalledWith(
        { organizationId: 'org-1', isSuperAdmin: true },
        { actorUserId: 'super-admin-1', action: 'super_admin.org_switch_out', entityType: 'organization', entityId: 'org-1' },
      );
    });
  });
});
