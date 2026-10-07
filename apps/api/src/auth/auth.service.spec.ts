import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHash } from 'crypto';
import { AuthService, SignedIn } from './auth.service';
import { MfaService } from './mfa.service';
import { DEFAULT_SECURITY_POLICY, PrismaService, SecurityPolicySettings, loadTenantSecurityPolicy, resolvePermissionGrants, staffDeskIpAllowed } from '@exam-platform/shared';
import { TenantPrismaService } from '@exam-platform/shared';
import { AuditService } from '@exam-platform/shared';
import { EmailService } from '../email/email.service';
import { SessionsService } from './sessions.service';
import { LOGIN_PROTECTION_REDIS, LoginProtectionService, TooManyLoginAttemptsException } from './login-protection.service';
import { CompanyScopeService } from './company-scope';
import { PasswordPolicyService } from './password-policy.service';
import { OtpService } from './otp.service';

// The company security policy is read through the shared (cached) loader; stub it per test so a
// test controls the policy without the cache leaking between tests. Default: no policy row.
jest.mock('@exam-platform/shared', () => {
  const actual = jest.requireActual('@exam-platform/shared');
  return {
    ...actual,
    loadTenantSecurityPolicy: jest.fn(async () => actual.DEFAULT_SECURITY_POLICY),
    staffDeskIpAllowed: jest.fn(async () => true),
    resolvePermissionGrants: jest.fn(async () => new Set()),
  };
});
const policyLoader = loadTenantSecurityPolicy as jest.Mock;
const deskIpAllowed = staffDeskIpAllowed as jest.Mock;
const grants = resolvePermissionGrants as jest.Mock;
const setPolicy = (overrides: Partial<SecurityPolicySettings>) =>
  policyLoader.mockImplementation(async () => ({ ...DEFAULT_SECURITY_POLICY, ...overrides }));

// The real argon2, with verify() observable (still delegates to the real implementation).
jest.mock('argon2', () => {
  const actual = jest.requireActual('argon2');
  return { ...actual, verify: jest.fn((...args: unknown[]) => actual.verify(...args)) };
});

const META = { ip: '203.0.113.9', userAgent: 'jest-agent', deviceId: 'd'.repeat(43) };
const SESSION_ID = '44444444-4444-4444-8444-444444444444';

const DEFAULT_LOCKOUT = { maxFailedAttempts: 10, lockMinutes: 15 };

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    organization: { findUnique: jest.Mock };
    refreshToken: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    user: { findUnique: jest.Mock; update: jest.Mock };
    passwordResetToken: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    session: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let sessions: {
    create: jest.Mock; findLive: jest.Mock; revokeById: jest.Mock; recordLoginEvent: jest.Mock;
    notifyNewDevice: jest.Mock; notifyLocked: jest.Mock; notifyBreakGlass: jest.Mock; notifyNewCountry: jest.Mock; notifyAdmins: jest.Mock;
  };
  let passwordPolicy: { hashNewPassword: jest.Mock; recheckAfterLogin: jest.Mock };
  let loginProtection: { check: jest.Mock; reserve: jest.Mock; registerFailure: jest.Mock; registerSuccess: jest.Mock };
  let absoluteExpiresAt: Date;
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  let emailService: { send: jest.Mock };
  let jwt: JwtService;
  let mfa: Record<string, jest.Mock>;
  let otp: Record<string, jest.Mock>;
  let companyScope: { cookieValue: jest.Mock; card: jest.Mock };
  // A tiny Redis: the company-choice token store.
  let store: Map<string, string>;
  let redis: { set: jest.Mock; getdel: jest.Mock };

  beforeEach(async () => {
    companyScope = { cookieValue: jest.fn((id: string) => `${id}.signed`), card: jest.fn(async (org: { name: string }) => ({ name: org.name, logoUrl: null })) };
    store = new Map();
    redis = {
      set: jest.fn(async (key: string, value: string) => (store.set(key, value), 'OK')),
      getdel: jest.fn(async (key: string) => {
        const value = store.get(key) ?? null;
        store.delete(key);
        return value;
      }),
    };
    // No second factor enrolled unless a test says so; MFA not required.
    mfa = {
      hasFactor: jest.fn().mockResolvedValue(false),
      loadUser: jest.fn().mockResolvedValue(null),
      mfaRequiredFor: jest.fn().mockResolvedValue(false),
      activeFactors: jest.fn().mockResolvedValue([{ type: 'totp' }]),
      usableFactors: jest.fn().mockResolvedValue([{ type: 'totp' }]),
      cancelPendingLogins: jest.fn().mockResolvedValue(undefined),
      createPendingLogin: jest.fn().mockResolvedValue('pending-token'),
      loadPendingLogin: jest.fn().mockResolvedValue(null),
      consumePendingLogin: jest.fn().mockResolvedValue(true),
      takeLoginChallenge: jest.fn().mockResolvedValue(null),
      verifyProof: jest.fn().mockResolvedValue(null),
    };
    otp = {
      channelAvailable: jest.fn().mockReturnValue(true),
      reserveSend: jest.fn().mockResolvedValue(undefined),
      issue: jest.fn().mockResolvedValue('123456'),
      peek: jest.fn().mockResolvedValue(null),
      check: jest.fn().mockResolvedValue(null),
      deliver: jest.fn(),
    };
    prisma = {
      organization: { findUnique: jest.fn() },
      refreshToken: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      user: { findUnique: jest.fn(), update: jest.fn() },
      passwordResetToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      session: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
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
    absoluteExpiresAt = new Date(Date.now() + 12 * 3600 * 1000);
    sessions = {
      create: jest.fn().mockResolvedValue({ id: SESSION_ID, absoluteExpiresAt, newDevice: false }),
      findLive: jest.fn().mockImplementation(async (id: string) => ({ id, absoluteExpiresAt })),
      revokeById: jest.fn().mockResolvedValue(undefined),
      recordLoginEvent: jest.fn().mockResolvedValue(undefined),
      notifyNewDevice: jest.fn(),
      notifyLocked: jest.fn(),
      notifyBreakGlass: jest.fn(),
      notifyNewCountry: jest.fn(),
      notifyAdmins: jest.fn(),
    };
    passwordPolicy = {
      hashNewPassword: jest.fn(async (password: string) => ({ passwordHash: await argon2.hash(password), passwordRecheckPending: false })),
      recheckAfterLogin: jest.fn().mockResolvedValue(undefined),
    };
    policyLoader.mockImplementation(async () => DEFAULT_SECURITY_POLICY);
    deskIpAllowed.mockResolvedValue(true);
    loginProtection = {
      check: jest.fn().mockResolvedValue(null),
      reserve: jest.fn().mockResolvedValue({ block: null, failures: 1, lockExempt: false }),
      registerFailure: jest.fn().mockResolvedValue({ failures: 1, locked: false }),
      registerSuccess: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AuditService, useValue: audit },
        { provide: EmailService, useValue: emailService },
        { provide: SessionsService, useValue: sessions },
        { provide: LoginProtectionService, useValue: loginProtection },
        { provide: PasswordPolicyService, useValue: passwordPolicy },
        { provide: MfaService, useValue: mfa },
        { provide: OtpService, useValue: otp },
        { provide: CompanyScopeService, useValue: companyScope },
        { provide: LOGIN_PROTECTION_REDIS, useValue: redis },
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
      service.login({ organizationSlug: 'no-such-org', email: 'a@b.com', password: 'x' }, META),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects login on a wrong password', async () => {
    const passwordHash = await argon2.hash('correct-password');
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', status: 'active' });
    tenantPrisma.forTenant.mockResolvedValue({
      id: 'user-1', organizationId: 'org-1', role: 'org_admin', passwordHash,
    });

    await expect(
      service.login({ organizationSlug: 'demo-org', email: 'admin@demo-org.test', password: 'wrong-password' }, META),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('issues an access and refresh token on correct credentials', async () => {
    const passwordHash = await argon2.hash('correct-password');
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', status: 'active' });
    tenantPrisma.forTenant.mockResolvedValueOnce({
      id: 'user-1', organizationId: 'org-1', role: 'org_admin', status: 'active', passwordHash,
    });
    tenantPrisma.forTenant.mockResolvedValueOnce(undefined);
    prisma.refreshToken.create.mockResolvedValue({});

    const result = (await service.login({
      organizationSlug: 'demo-org', email: 'admin@demo-org.test', password: 'correct-password',
    }, META)) as SignedIn;

    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toEqual(expect.any(String));
    const decoded = jwt.decode(result.accessToken) as { organizationId: string; role: string };
    expect(decoded.organizationId).toBe('org-1');
    expect(decoded.role).toBe('org_admin');
  });

  it('mints an access token carrying the logged-in user\'s permissionProfileId', async () => {
    const passwordHash = await argon2.hash('correct-password');
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', status: 'active' });
    tenantPrisma.forTenant.mockResolvedValueOnce({
      id: 'user-1', organizationId: 'org-1', role: 'org_admin', status: 'active', passwordHash,
      permissionProfileId: 'profile-1',
    });
    tenantPrisma.forTenant.mockResolvedValueOnce(undefined);
    prisma.refreshToken.create.mockResolvedValue({});

    const result = (await service.login({
      organizationSlug: 'demo-org', email: 'admin@demo-org.test', password: 'correct-password',
    }, META)) as SignedIn;

    const decoded = jwt.decode(result.accessToken) as { permissionProfileId: string | null };
    expect(decoded.permissionProfileId).toBe('profile-1');
  });

  it('mints an access token with permissionProfileId null when the user has no assignment', async () => {
    const passwordHash = await argon2.hash('correct-password');
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', status: 'active' });
    tenantPrisma.forTenant.mockResolvedValueOnce({
      id: 'user-1', organizationId: 'org-1', role: 'org_admin', status: 'active', passwordHash,
      permissionProfileId: null,
    });
    tenantPrisma.forTenant.mockResolvedValueOnce(undefined);
    prisma.refreshToken.create.mockResolvedValue({});

    const result = (await service.login({
      organizationSlug: 'demo-org', email: 'admin@demo-org.test', password: 'correct-password',
    }, META)) as SignedIn;

    const decoded = jwt.decode(result.accessToken) as { permissionProfileId: string | null };
    expect(decoded.permissionProfileId).toBeNull();
  });

  it('records lastLoginAt on successful password login, RLS-scoped to the user\'s own org', async () => {
    const passwordHash = await argon2.hash('correct-password');
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', status: 'active' });
    const userUpdate = jest.fn();
    tenantPrisma.forTenant
      .mockResolvedValueOnce({
        id: 'user-1', organizationId: 'org-1', role: 'org_admin', status: 'active', passwordHash,
      })
      .mockImplementationOnce(async (_ctx: unknown, fn: (tx: unknown) => unknown) => fn({ user: { update: userUpdate } }));
    prisma.refreshToken.create.mockResolvedValue({});

    await service.login({ organizationSlug: 'demo-org', email: 'admin@demo-org.test', password: 'correct-password' }, META);

    expect(tenantPrisma.forTenant).toHaveBeenLastCalledWith(
      { organizationId: 'org-1', isSuperAdmin: false },
      expect.any(Function),
    );
    expect(userUpdate).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { lastLoginAt: expect.any(Date) } });
  });

  it('rejects login for a deactivated user even with the correct password', async () => {
    const passwordHash = await argon2.hash('password1');
    prisma.organization.findUnique.mockResolvedValue({ id: 'org1', status: 'active' });
    tenantPrisma.forTenant.mockImplementation(async (_ctx: unknown, fn: (tx: unknown) => unknown) =>
      fn({
        user: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'u1', organizationId: 'org1', role: 'recruiter', status: 'deactivated', passwordHash,
          }),
        },
      }),
    );
    await expect(
      service.login({ organizationSlug: 'acme', email: 'a@b.com', password: 'password1' }, META),
    ).rejects.toThrow('This account has been deactivated');
  });

  it('revokes the whole refresh-token family and audits the incident, attributed to the compromised user\'s real org, on reuse detection', async () => {
    const refreshToken = jwt.sign({ sub: 'user-1', familyId: 'family-1' }, { secret: process.env.JWT_REFRESH_SECRET });
    prisma.refreshToken.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', organizationId: 'org-1', role: 'org_admin' });

    await expect(service.refresh(refreshToken)).rejects.toThrow(UnauthorizedException);

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', familyId: 'family-1', revokedAt: null },
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
    // ...and the session itself, so access tokens already minted from it stop working now.
    expect(sessions.revokeById).toHaveBeenCalledWith('family-1', 'user-1', 'refresh_token_reuse');
  });

  describe('concurrent-refresh grace window (F3)', () => {
    // 119 forced logouts in 10 days, 72 of them within 10s of another for the same user: two
    // tabs each refreshing, the second arriving with the token the first had just rotated.
    // Reuse detection is right to exist; treating THIS as reuse is not.
    it('forgives a token revoked by rotation moments ago and returns a token pair without revoking the family', async () => {
      const refreshToken = jwt.sign({ sub: 'user-1', familyId: 'family-1' }, { secret: process.env.JWT_REFRESH_SECRET });
      const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
      prisma.refreshToken.findFirst
        // 1st lookup: newest LIVE row -- a different token (the other tab's rotation result).
        .mockResolvedValueOnce({ id: 'rt-live', tokenHash: 'someone-elses-hash', createdAt: new Date() })
        // 2nd lookup: the presented token IS the row rotated out 2 seconds ago.
        .mockResolvedValueOnce({ id: 'rt-old', tokenHash, revokedAt: new Date(Date.now() - 2_000) });
      tenantPrisma.forTenant.mockResolvedValue({
        id: 'user-1', organizationId: 'org-1', role: 'org_admin', status: 'active', permissionProfileId: 'profile-1',
      });
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', status: 'active' });

      const result = await service.refresh(refreshToken);

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      // The whole point: NO family revocation, NO reuse audit.
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'auth.token_reuse_detected' }),
      );
    });

    it('re-issues carrying the CURRENT user row\'s permissionProfileId, not whatever the old token had', async () => {
      // The whole point of re-reading the user on every refresh: an admin can reassign a
      // profile mid-session and have it take effect on the user's very next silent refresh,
      // without forcing a re-login.
      const refreshToken = jwt.sign({ sub: 'user-1', familyId: 'family-1' }, { secret: process.env.JWT_REFRESH_SECRET });
      const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
      prisma.refreshToken.findFirst.mockResolvedValue({ id: 'rt-1', tokenHash, revokedAt: null });
      tenantPrisma.forTenant.mockResolvedValue({
        id: 'user-1', organizationId: 'org-1', role: 'org_admin', status: 'active', permissionProfileId: 'profile-new',
      });
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', status: 'active' });

      const result = await service.refresh(refreshToken);

      const decoded = jwt.decode(result.accessToken) as { permissionProfileId: string | null };
      expect(decoded.permissionProfileId).toBe('profile-new');
    });

    it('still treats a token revoked OUTSIDE the grace window as reuse and revokes the family', async () => {
      const refreshToken = jwt.sign({ sub: 'user-1', familyId: 'family-1' }, { secret: process.env.JWT_REFRESH_SECRET });
      const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
      // The grace lookup filters `revokedAt >= now - window` in the WHERE clause, so a row
      // revoked 5 minutes ago is not returned by the database at all. Model that faithfully:
      // the second findFirst resolves null. (A mock that returned the stale row regardless
      // would be testing a query the code never issues.)
      prisma.refreshToken.findFirst
        .mockResolvedValueOnce({ id: 'rt-live', tokenHash: 'someone-elses-hash', createdAt: new Date() })
        .mockResolvedValueOnce(null);
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', organizationId: 'org-1', role: 'org_admin' });

      await expect(service.refresh(refreshToken)).rejects.toThrow(UnauthorizedException);

      // Pin that the grace lookup was constrained to the window AND to this exact token's
      // hash -- the two facts that separate "forgives the race" from "forgives any old token".
      expect(prisma.refreshToken.findFirst).toHaveBeenNthCalledWith(2, expect.objectContaining({
        where: expect.objectContaining({ tokenHash, revokedAt: { gte: expect.any(Date) } }),
      }));
      const gteArg = prisma.refreshToken.findFirst.mock.calls[1][0].where.revokedAt.gte as Date;
      expect(Date.now() - gteArg.getTime()).toBeGreaterThanOrEqual(9_000);
      expect(Date.now() - gteArg.getTime()).toBeLessThanOrEqual(11_000);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', familyId: 'family-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('does not forgive a token whose hash does NOT match the recently-revoked row', async () => {
      // The important negative: there IS a rotation within the window (the legitimate tab's),
      // but the presented token is not that token. Forgiving here would let any junk token
      // ride the grace path whenever the family had rotated recently. Mutation-checked:
      // dropping the hash comparison must turn this red.
      const refreshToken = jwt.sign({ sub: 'user-1', familyId: 'family-1' }, { secret: process.env.JWT_REFRESH_SECRET });
      // The hash is in the WHERE clause, so a token that matches no recent rotation returns no
      // row at all. Additionally pin that the query DID carry this token's hash, so a
      // regression to an unfiltered lookup is caught even though the mock returns null.
      const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
      prisma.refreshToken.findFirst
        .mockResolvedValueOnce({ id: 'rt-live', tokenHash: 'someone-elses-hash', createdAt: new Date() })
        .mockResolvedValueOnce(null);
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', organizationId: 'org-1', role: 'org_admin' });

      await expect(service.refresh(refreshToken)).rejects.toThrow(UnauthorizedException);
      expect(prisma.refreshToken.findFirst).toHaveBeenNthCalledWith(2, expect.objectContaining({
        where: expect.objectContaining({ tokenHash }),
      }));
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', familyId: 'family-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    // ---- The two Criticals from security review, pinned shut ----

    it('does NOT forgive when the family has no live successor -- a logged-out / reset session stays dead', async () => {
      // Attacker holds a copy of token T. User logs out (family revoked, T's row stamped now).
      // Attacker replays T within the window. There is NO live row (`stored` null) because
      // nothing rotated -- the family was killed. Forgiving here would resurrect a session
      // the user deliberately ended. It must not.
      const refreshToken = jwt.sign({ sub: 'user-1', familyId: 'family-1' }, { secret: process.env.JWT_REFRESH_SECRET });
      prisma.refreshToken.findFirst.mockResolvedValueOnce(null); // no live row in the family
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', organizationId: 'org-1', role: 'org_admin' });

      await expect(service.refresh(refreshToken)).rejects.toThrow(UnauthorizedException);

      // The grace lookup must not even be attempted without a live successor.
      expect(prisma.refreshToken.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('revokes only LIVE rows on reuse detection, so a dead family cannot be kept inside the grace window by retrying', async () => {
      // If reuse detection re-stamped every row to now on each attempt, an attacker could
      // retry every few seconds and hold the family perpetually inside the window.
      const refreshToken = jwt.sign({ sub: 'user-1', familyId: 'family-1' }, { secret: process.env.JWT_REFRESH_SECRET });
      prisma.refreshToken.findFirst.mockResolvedValueOnce(null);
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', organizationId: 'org-1', role: 'org_admin' });

      await expect(service.refresh(refreshToken)).rejects.toThrow(UnauthorizedException);

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ revokedAt: null }) }),
      );
    });

    it('does not forgive a token that matches no row in the family at all', async () => {
      // A forged or foreign token must not slip through the grace path.
      const refreshToken = jwt.sign({ sub: 'user-1', familyId: 'family-1' }, { secret: process.env.JWT_REFRESH_SECRET });
      prisma.refreshToken.findFirst
        .mockResolvedValueOnce({ id: 'rt-live', tokenHash: 'someone-elses-hash', createdAt: new Date() })
        .mockResolvedValueOnce(null);
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', organizationId: 'org-1', role: 'org_admin' });

      await expect(service.refresh(refreshToken)).rejects.toThrow(UnauthorizedException);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
    });
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

  it('rejects refreshing a token for a deactivated user, even though the stored refresh token itself is still valid', async () => {
    const refreshToken = jwt.sign({ sub: 'user-1', familyId: 'family-1' }, { secret: process.env.JWT_REFRESH_SECRET });
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    prisma.refreshToken.findFirst.mockResolvedValue({ id: 'rt-1', tokenHash, createdAt: new Date() });
    tenantPrisma.forTenant.mockImplementation(async (_ctx: unknown, fn: (tx: unknown) => unknown) =>
      fn({
        user: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'user-1', organizationId: 'org-1', role: 'recruiter', status: 'deactivated' }),
        },
      }),
    );

    await expect(service.refresh(refreshToken)).rejects.toThrow('This account has been deactivated');
  });

  describe('forgotPassword', () => {
    it('creates a hashed reset token and emails a link when the org and user match', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', slug: 'demo-org', status: 'active' });
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
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', slug: 'demo-org', status: 'active' });
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
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', slug: 'demo-org', status: 'active' });
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
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', organizationId: 'org-1', role: 'recruiter', email: 'U1@x.test', organization: { slug: 'acme' } });

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
        data: { passwordHash: expect.any(String), passwordRecheckPending: false, passwordChangeRequired: false },
      });
      // The floor for the account's own organisation (YX-IAM-08).
      expect(passwordPolicy.hashNewPassword).toHaveBeenCalledWith('NewPassw0rd!', 'org-1');
      // The weaker expect.any(String) check above would also pass for a hash of the
      // wrong password (or garbage) -- verify the stored hash actually verifies against
      // the newPassword that was submitted.
      const storedPasswordHash = prisma.user.update.mock.calls[0][0].data.passwordHash;
      expect(await argon2.verify(storedPasswordHash, 'NewPassw0rd!')).toBe(true);
      // Compare-and-set (see the race test below).
      expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
        where: { id: 'prt-1', usedAt: null, expiresAt: { gt: expect.any(Date) } },
        data: { usedAt: expect.any(Date) },
      });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date), revokedReason: 'password_reset' },
      });
      expect(audit.record).toHaveBeenCalledWith(
        { organizationId: 'org-1', isSuperAdmin: false },
        { actorUserId: 'user-1', action: 'password.reset', entityType: 'user', entityId: 'user-1' },
      );
      // Half-finished sign-ins won with the old password die; the owner's lock is lifted.
      expect(mfa.cancelPendingLogins).toHaveBeenCalledWith('user-1');
      expect(loginProtection.registerSuccess).toHaveBeenCalledWith('acme', 'u1@x.test', null);
      expect(loginProtection.registerSuccess).toHaveBeenCalledWith('mfa', 'user-1', null);
    });

    // Regression: findUnique then an unconditional update let two concurrent resets with one
    // leaked link both succeed (last write wins).
    it('of two concurrent resets with one link, the loser changes nothing', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({ id: 'prt-1', userId: 'user-1', usedAt: null, expiresAt: new Date(Date.now() + 60_000) });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', organizationId: 'org-1', role: 'recruiter', email: 'u1@x.test', organization: { slug: 'acme' } });
      prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 }); // the other request consumed it

      await expect(service.resetPassword({ token: 'raw-token', newPassword: 'NewPassw0rd!' })).rejects.toThrow('invalid or has expired');
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.session.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('issueTokensForSso', () => {
    const SSO_USER = { id: 'user-1', email: 'u1@x.test', organizationId: 'org-1', role: 'recruiter', permissionProfileId: 'profile-1' };

    it('opens a saml session and issues a pair bound to it, matching the shape login() produces', async () => {
      prisma.refreshToken.create.mockResolvedValue({ id: 'rt-1' });

      const result = (await service.issueTokensForSso(SSO_USER, META)) as SignedIn;

      expect(sessions.create).toHaveBeenCalledWith(SSO_USER, 'saml', META, undefined, null);
      const access = jwt.verify(result.accessToken, { secret: process.env.JWT_ACCESS_SECRET }) as Record<string, unknown>;
      expect(access).toMatchObject({ sub: 'user-1', organizationId: 'org-1', role: 'recruiter', permissionProfileId: 'profile-1', sid: SESSION_ID });
      const refresh = jwt.verify(result.refreshToken, { secret: process.env.JWT_REFRESH_SECRET }) as { familyId: string };
      expect(refresh.familyId).toBe(SESSION_ID);
      expect(prisma.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: 'user-1', familyId: SESSION_ID, expiresAt: absoluteExpiresAt }),
      });
      expect(sessions.recordLoginEvent).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', result: 'success', method: 'saml', sessionId: SESSION_ID }),
      );
    });

    it('records lastLoginAt for the SSO-authenticated user', async () => {
      prisma.refreshToken.create.mockResolvedValue({ id: 'rt-1' });
      const userUpdate = jest.fn();
      tenantPrisma.forTenant.mockImplementationOnce(async (_ctx: unknown, fn: (tx: unknown) => unknown) =>
        fn({ user: { update: userUpdate } }),
      );

      await service.issueTokensForSso({ ...SSO_USER, permissionProfileId: null }, META);

      expect(tenantPrisma.forTenant).toHaveBeenCalledWith(
        { organizationId: 'org-1', isSuperAdmin: false },
        expect.any(Function),
      );
      expect(userUpdate).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { lastLoginAt: expect.any(Date) } });
    });
  });

  describe('switchIntoOrg', () => {
    it('throws when the target org does not exist', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);

      await expect(service.switchIntoOrg('super-admin-1', 'no-such-org', SESSION_ID)).rejects.toThrow(NotFoundException);
    });

    it('audit-logs the switch-in against the target org and returns an acting access token', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', name: 'Acme Inc', slug: 'acme', status: 'active' });

      const token = await service.switchIntoOrg('super-admin-1', 'org-1', SESSION_ID);

      expect(audit.record).toHaveBeenCalledWith(
        { organizationId: 'org-1', isSuperAdmin: true },
        { actorUserId: 'super-admin-1', action: 'super_admin.org_switch_in', entityType: 'organization', entityId: 'org-1' },
      );
      const payload = jwt.verify(token, { secret: 'test-secret' }) as {
        sub: string; organizationId: string; role: string; permissionProfileId: string | null;
        actingSuperAdmin: boolean; actingOrgName: string; actingOrgSlug: string;
      };
      expect(payload).toMatchObject({
        sub: 'super-admin-1', organizationId: 'org-1', role: 'super_admin', actingSuperAdmin: true, actingOrgName: 'Acme Inc',
        // Regression for ADO #6849: without the acting org's slug in the token, the frontend's
        // organizationSlug stayed at the super_admin's own (empty) value while acting into an
        // org, which disabled the per-org SSO-status check and showed "Reset password" for
        // every user regardless of whether the org they were viewing actually had SSO enabled.
        actingOrgSlug: 'acme',
        // Rides on the super admin's own session: revoking it ends the acting token too.
        sid: SESSION_ID,
      });
      // An acting-into-org token is never subject to profile-based field/permission
      // restriction -- actingSuperAdmin already bypasses that guard (T4) regardless, so
      // this is never resolved from a real profile assignment.
      expect(payload.permissionProfileId).toBeNull();
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

  describe('impersonate', () => {
    beforeEach(() => {
      jwt.sign = jest.fn().mockReturnValue('signed.jwt.token');
    });

    function mockTarget(target: unknown, caller: unknown) {
      tenantPrisma.forTenant.mockImplementation(async (_c: unknown, fn: (t: unknown) => unknown) =>
        fn({ user: { findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) =>
          where.id === 'target1' ? Promise.resolve(target) : Promise.resolve(caller)) } }),
      );
    }

    it('lets a super_admin impersonate a recruiter in another org', async () => {
      // The target has its own profile assignment ('target-profile'), but an impersonation
      // token must never carry it -- see permissionProfileId: null below. The guard (T4)
      // bypasses field/permission restriction entirely via actingSuperAdmin/impersonation
      // regardless, so the impersonated session is never resolved from a real profile.
      mockTarget(
        { id: 'target1', role: 'recruiter', organizationId: 'orgB', status: 'active', email: 't@x.com', permissionProfileId: 'target-profile' },
        { id: 'admin1', email: 'admin@x.com' },
      );
      const token = await service.impersonate({ userId: 'admin1', organizationId: null, role: 'super_admin', sessionId: SESSION_ID }, 'target1');
      expect(token).toBe('signed.jwt.token');
      expect(jwt.sign).toHaveBeenCalledWith(
        // sid is the impersonator's session: ending it ends the impersonation.
        expect.objectContaining({ sub: 'target1', role: 'recruiter', impersonatorUserId: 'admin1', permissionProfileId: null, sid: SESSION_ID }),
        expect.anything(),
      );
      expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'user.impersonate_start' }));
    });

    it('forbids a super_admin impersonating another super_admin', async () => {
      mockTarget({ id: 'target1', role: 'super_admin', organizationId: null, status: 'active', email: 't@x.com' }, { id: 'admin1', email: 'admin@x.com' });
      await expect(service.impersonate({ userId: 'admin1', organizationId: null, role: 'super_admin', sessionId: SESSION_ID }, 'target1')).rejects.toThrow(ForbiddenException);
    });

    it('forbids an org_admin impersonating a user in another org', async () => {
      mockTarget({ id: 'target1', role: 'recruiter', organizationId: 'orgB', status: 'active', email: 't@x.com' }, { id: 'admin1', email: 'admin@x.com' });
      await expect(service.impersonate({ userId: 'admin1', organizationId: 'orgA', role: 'org_admin', sessionId: SESSION_ID }, 'target1')).rejects.toThrow(ForbiddenException);
    });

    it('forbids an org_admin impersonating another org_admin', async () => {
      mockTarget({ id: 'target1', role: 'org_admin', organizationId: 'orgA', status: 'active', email: 't@x.com' }, { id: 'admin1', email: 'admin@x.com' });
      await expect(service.impersonate({ userId: 'admin1', organizationId: 'orgA', role: 'org_admin', sessionId: SESSION_ID }, 'target1')).rejects.toThrow(ForbiddenException);
    });

    it('rejects a deactivated target', async () => {
      mockTarget({ id: 'target1', role: 'recruiter', organizationId: 'orgA', status: 'deactivated', email: 't@x.com' }, { id: 'admin1', email: 'admin@x.com' });
      await expect(service.impersonate({ userId: 'admin1', organizationId: 'orgA', role: 'org_admin', sessionId: SESSION_ID }, 'target1')).rejects.toThrow(BadRequestException);
    });

    it('rejects self-impersonation', async () => {
      await expect(service.impersonate({ userId: 'admin1', organizationId: 'orgA', role: 'org_admin', sessionId: SESSION_ID }, 'admin1')).rejects.toThrow(BadRequestException);
    });

    it('rejects nested impersonation', async () => {
      await expect(service.impersonate({ userId: 'admin1', organizationId: 'orgA', role: 'org_admin', impersonatorUserId: 'x', sessionId: SESSION_ID }, 'target1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('recordImpersonationStop', () => {
    it('records user.impersonate_stop under the target user\'s org, matching where impersonate_start was filed', async () => {
      tenantPrisma.forTenant.mockResolvedValue({ organizationId: 'orgA' });

      await service.recordImpersonationStop('admin1', 'target1');

      expect(tenantPrisma.forTenant).toHaveBeenCalledWith(
        { organizationId: null, isSuperAdmin: true },
        expect.any(Function),
      );
      expect(audit.record).toHaveBeenCalledWith(
        { organizationId: 'orgA', isSuperAdmin: true },
        { actorUserId: 'admin1', action: 'user.impersonate_stop', entityType: 'user', entityId: 'target1' },
      );
    });
  });

  // A suspended / deleted organisation answers exactly like an unknown one (no organisation
  // enumeration); the real reason is in the login event.
  describe('organization suspension', () => {
    it('rejects password login when the organization is suspended', async () => {
      const passwordHash = await argon2.hash('password1');
      prisma.organization.findUnique.mockResolvedValue({ id: 'org1', status: 'suspended' });
      tenantPrisma.forTenant.mockImplementation(async (_ctx: unknown, fn: (tx: unknown) => unknown) =>
        fn({
          user: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'u1', organizationId: 'org1', role: 'recruiter', status: 'active', passwordHash,
            }),
          },
        }),
      );

      await expect(
        service.login({ organizationSlug: 'acme', email: 'a@b.com', password: 'password1' }, META),
      ).rejects.toThrow('Invalid credentials');
      expect(sessions.recordLoginEvent).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 'org1', result: 'failed', reason: 'organization_inactive' }));
      expect(sessions.create).not.toHaveBeenCalled();
    });

    it('rejects password login when the organization is deleted', async () => {
      const passwordHash = await argon2.hash('password1');
      prisma.organization.findUnique.mockResolvedValue({ id: 'org1', status: 'deleted' });
      tenantPrisma.forTenant.mockImplementation(async (_ctx: unknown, fn: (tx: unknown) => unknown) =>
        fn({
          user: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'u1', organizationId: 'org1', role: 'recruiter', status: 'active', passwordHash,
            }),
          },
        }),
      );

      await expect(
        service.login({ organizationSlug: 'acme', email: 'a@b.com', password: 'password1' }, META),
      ).rejects.toThrow('Invalid credentials');
    });

    it('rejects refresh rotation when the organization is suspended', async () => {
      // Checking only at login would let suspended staff keep rotating tokens
      // until natural expiry, so the suspension would appear not to have applied.
      const refreshToken = jwt.sign({ sub: 'user-1', familyId: 'family-1' }, { secret: process.env.JWT_REFRESH_SECRET });
      prisma.refreshToken.findFirst.mockResolvedValue({
        id: 'rt-1', userId: 'user-1', familyId: 'family-1', tokenHash: createHash('sha256').update(refreshToken).digest('hex'), revokedAt: null,
      });
      prisma.refreshToken.update.mockResolvedValue({});
      tenantPrisma.forTenant.mockImplementation(async (_ctx: unknown, fn: (tx: unknown) => unknown) =>
        fn({
          user: {
            findUniqueOrThrow: jest.fn().mockResolvedValue({
              id: 'user-1', organizationId: 'org-1', role: 'recruiter', status: 'active',
            }),
          },
        }),
      );
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', status: 'suspended' });

      await expect(service.refresh(refreshToken)).rejects.toThrow('This organization is not currently active');
    });

    it('does not block a super admin, who belongs to no organization', async () => {
      const passwordHash = await argon2.hash('password1');
      tenantPrisma.forTenant.mockImplementation(async (_ctx: unknown, fn: (tx: unknown) => unknown) =>
        fn({
          user: {
            findFirst: jest.fn().mockResolvedValue({ id: 'u1', email: 'root@platform.test', organizationId: null, role: 'super_admin', status: 'active', passwordHash }),
            update: jest.fn(),
          },
        }),
      );

      await expect(service.loginPlatformStaff({ email: 'root@platform.test', password: 'password1' }, META)).resolves.toHaveProperty(
        'accessToken',
      );
      // No slug: no organisation is looked up by slug -- nothing to suspend.
      expect(prisma.organization.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('sessions, login events and lockout (YX-IAM-06/07/10)', () => {
    const DTO = { organizationSlug: 'demo-org', email: 'Admin@Demo-Org.test', password: 'correct-password' };
    let passwordHash: string;
    const activeUser = () => ({
      id: 'user-1', email: 'admin@demo-org.test', organizationId: 'org-1', role: 'org_admin', status: 'active', passwordHash,
    });

    beforeAll(async () => {
      passwordHash = await argon2.hash('correct-password');
    });

    beforeEach(() => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', status: 'active' });
    });

    it('refuses a blocked account with 429 BEFORE looking at the password, and records a locked attempt', async () => {
      loginProtection.reserve.mockResolvedValue({ block: { scope: 'account', retryAfterSeconds: 900 }, failures: 0, lockExempt: false });
      tenantPrisma.forTenant.mockResolvedValueOnce(activeUser());
      const verify = argon2.verify as unknown as jest.Mock;
      verify.mockClear();

      const attempt = service.login(DTO, META);

      await expect(attempt).rejects.toBeInstanceOf(TooManyLoginAttemptsException);
      await expect(attempt).rejects.toMatchObject({ retryAfterSeconds: 900 });
      // The attempt is reserved (counted atomically) before any password work, on this device.
      expect(loginProtection.reserve).toHaveBeenCalledWith('demo-org', 'admin@demo-org.test', META.ip, { deviceId: META.deviceId, lockExempt: false, lockout: DEFAULT_LOCKOUT });
      expect(verify).not.toHaveBeenCalled(); // no password check
      expect(sessions.recordLoginEvent).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1', result: 'locked', reason: 'account_locked', identifier: 'admin@demo-org.test' }),
      );
      expect(sessions.create).not.toHaveBeenCalled();
    });

    it("counts under the company's lockout settings, and the default for an unknown organisation (YX-IAM-07)", async () => {
      setPolicy({ maxFailedAttempts: 3, lockMinutes: 60 });
      tenantPrisma.forTenant.mockResolvedValueOnce(null); // unknown account: same settings as a real one
      await expect(service.login(DTO, META)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(loginProtection.reserve).toHaveBeenLastCalledWith('demo-org', 'admin@demo-org.test', META.ip, expect.objectContaining({ lockout: { maxFailedAttempts: 3, lockMinutes: 60 } }));

      prisma.organization.findUnique.mockResolvedValue(null);
      await expect(service.login(DTO, META)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(loginProtection.reserve).toHaveBeenLastCalledWith('demo-org', 'admin@demo-org.test', META.ip, expect.objectContaining({ lockout: DEFAULT_LOCKOUT }));
    });

    it('a correct password does not get through a lock either', async () => {
      loginProtection.reserve.mockResolvedValue({ block: { scope: 'ip', retryAfterSeconds: 60 }, failures: 0, lockExempt: false });
      tenantPrisma.forTenant.mockResolvedValue(activeUser());

      await expect(service.login(DTO, META)).rejects.toBeInstanceOf(TooManyLoginAttemptsException);
      expect(sessions.create).not.toHaveBeenCalled();
    });

    it('treats unknown user, wrong password and unknown organisation identically (no enumeration)', async () => {
      const verify = argon2.verify as unknown as jest.Mock;
      verify.mockClear();
      const outcomes: unknown[] = [];

      tenantPrisma.forTenant.mockResolvedValueOnce(null); // unknown user
      outcomes.push(await service.login(DTO, META).catch((e: Error) => [e.constructor, e.message]));
      tenantPrisma.forTenant.mockResolvedValueOnce(activeUser()); // wrong password
      outcomes.push(await service.login({ ...DTO, password: 'wrong' }, META).catch((e: Error) => [e.constructor, e.message]));
      prisma.organization.findUnique.mockResolvedValueOnce(null); // unknown organisation
      outcomes.push(await service.login({ ...DTO, organizationSlug: 'nope' }, META).catch((e: Error) => [e.constructor, e.message]));

      expect(outcomes).toEqual([
        [UnauthorizedException, 'Invalid credentials'],
        [UnauthorizedException, 'Invalid credentials'],
        [UnauthorizedException, 'Invalid credentials'],
      ]);
      // An argon2 verification ran in all three cases (dummy hash when no account matched),
      // so response time does not reveal whether the account exists.
      expect(verify).toHaveBeenCalledTimes(3);
      expect(loginProtection.registerFailure).toHaveBeenCalledTimes(3);
      expect(sessions.recordLoginEvent.mock.calls.map(([e]) => [e.result, e.reason])).toEqual([
        ['failed', 'unknown_user'],
        ['failed', 'bad_password'],
        ['failed', 'unknown_organization'],
      ]);
    });

    it('notifies the account holder when a failure starts a lock -- and only a real account', async () => {
      loginProtection.registerFailure.mockResolvedValue({ failures: 10, locked: true });

      tenantPrisma.forTenant.mockResolvedValueOnce(activeUser());
      await expect(service.login({ ...DTO, password: 'wrong' }, META)).rejects.toThrow('Invalid credentials');
      expect(sessions.notifyLocked).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1' }), META, undefined);
      expect(sessions.recordLoginEvent).toHaveBeenCalledWith(expect.objectContaining({ reason: 'bad_password+lockout_started' }));

      sessions.notifyLocked.mockClear();
      tenantPrisma.forTenant.mockResolvedValueOnce(null);
      await expect(service.login(DTO, META)).rejects.toThrow('Invalid credentials');
      expect(sessions.notifyLocked).not.toHaveBeenCalled();
    });

    it('on success: clears the failure history, opens a session and binds both tokens to it', async () => {
      tenantPrisma.forTenant.mockResolvedValueOnce(activeUser());
      prisma.refreshToken.create.mockResolvedValue({});

      const result = (await service.login(DTO, META)) as SignedIn;

      // Cleared once the password is right, and the device trusted once the sign-in completes.
      expect(loginProtection.registerSuccess).toHaveBeenCalledWith('demo-org', 'admin@demo-org.test', META.ip);
      expect(loginProtection.registerSuccess).toHaveBeenCalledWith('demo-org', 'admin@demo-org.test', META.ip, { deviceId: META.deviceId, trustDevice: true });
      expect(sessions.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1' }), 'password', META, undefined, null);
      const access = jwt.verify(result.accessToken, { secret: process.env.JWT_ACCESS_SECRET }) as { sid: string };
      expect(access.sid).toBe(SESSION_ID);
      const refresh = jwt.verify(result.refreshToken, { secret: process.env.JWT_REFRESH_SECRET }) as { familyId: string; exp: number; jti: string };
      expect(refresh.familyId).toBe(SESSION_ID);
      expect(refresh.jti).toEqual(expect.any(String));
      // The refresh token dies with the session's absolute limit, never later.
      expect(Math.abs(refresh.exp * 1000 - absoluteExpiresAt.getTime())).toBeLessThan(2000);
      expect(prisma.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ familyId: SESSION_ID, expiresAt: absoluteExpiresAt }),
      });
      expect(sessions.recordLoginEvent).toHaveBeenCalledWith(
        expect.objectContaining({ result: 'success', method: 'password', sessionId: SESSION_ID, userId: 'user-1' }),
      );
      expect(sessions.notifyNewDevice).not.toHaveBeenCalled();
    });

    it('alerts the user when the sign-in comes from a new device', async () => {
      tenantPrisma.forTenant.mockResolvedValueOnce(activeUser());
      sessions.create.mockResolvedValueOnce({ id: SESSION_ID, absoluteExpiresAt, newDevice: true });

      await service.login(DTO, META);

      expect(sessions.notifyNewDevice).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1' }), META);
      expect(sessions.recordLoginEvent).toHaveBeenCalledWith(expect.objectContaining({ newDevice: true }));
    });

    // Break-glass accounts (YX-IAM-04) must stay usable during an SSO outage: they get the
    // progressive delay but never the long lock, and their admins hear about the guessing.
    it('a break-glass account is never long-locked; reaching the threshold alerts every admin instead', async () => {
      setPolicy({ ssoOnly: true, breakGlassUserIds: ['user-1', 'user-2'] });
      tenantPrisma.forTenant.mockResolvedValueOnce(activeUser());
      loginProtection.reserve.mockResolvedValue({ block: null, failures: 10, lockExempt: true });
      loginProtection.registerFailure.mockResolvedValue({ failures: 10, locked: true });

      await expect(service.login({ ...DTO, password: 'wrong' }, META)).rejects.toThrow('Invalid credentials');
      expect(loginProtection.reserve).toHaveBeenCalledWith('demo-org', 'admin@demo-org.test', META.ip, { deviceId: META.deviceId, lockExempt: true, lockout: DEFAULT_LOCKOUT });
      expect(sessions.notifyAdmins).toHaveBeenCalledWith('org-1', 'Repeated failed sign-ins to a break-glass account', expect.any(String), expect.any(Array));
      expect(JSON.stringify(sessions.notifyAdmins.mock.calls[0][3])).toContain('admin@demo-org.test');
      expect(sessions.notifyLocked).not.toHaveBeenCalled();
    });

    it('a new country on a known device alerts the user', async () => {
      tenantPrisma.forTenant.mockResolvedValueOnce(activeUser());
      sessions.create.mockResolvedValueOnce({ id: SESSION_ID, absoluteExpiresAt, newDevice: false, newCountry: true });
      await service.login(DTO, { ...META, country: 'BR' });
      expect(sessions.notifyNewCountry).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1' }), { ...META, country: 'BR' });
    });

    // Regression (ASVS V2.1.7): a password found in a breach on re-check had to be changed only
    // "please"; now the next sign-in hands out a reset token instead of a session.
    it('a password marked breached must be changed: no session, a single-use reset token instead', async () => {
      tenantPrisma.forTenant.mockResolvedValueOnce(activeUser());
      mfa.loadUser.mockResolvedValue({ id: 'user-1', passwordChangeRequired: true });

      const attempt = service.login(DTO, META);
      await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
      await expect(attempt).rejects.toMatchObject({ response: expect.objectContaining({ code: 'PASSWORD_CHANGE_REQUIRED', resetToken: expect.stringMatching(/^[0-9a-f]{64}$/) }) });
      expect(sessions.create).not.toHaveBeenCalled();
      // Only its hash is stored.
      const stored = prisma.passwordResetToken.create.mock.calls.at(-1)![0].data;
      expect(stored).toEqual(expect.objectContaining({ userId: 'user-1', tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/) }));
    });

    it('a deactivated account with the right password is recorded, not counted as a guess', async () => {
      tenantPrisma.forTenant.mockResolvedValueOnce({ ...activeUser(), status: 'deactivated' });

      await expect(service.login(DTO, META)).rejects.toThrow('deactivated');
      expect(loginProtection.registerFailure).not.toHaveBeenCalled();
      expect(sessions.recordLoginEvent).toHaveBeenCalledWith(expect.objectContaining({ result: 'failed', reason: 'account_inactive' }));
      expect(sessions.create).not.toHaveBeenCalled();
    });

    it('refresh: a revoked / expired / idle session ends the family with 401 and is NOT treated as reuse', async () => {
      const refreshToken = jwt.sign({ sub: 'user-1', familyId: 'family-1' }, { secret: process.env.JWT_REFRESH_SECRET });
      sessions.findLive.mockResolvedValueOnce(null);

      await expect(service.refresh(refreshToken)).rejects.toThrow('Session expired');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', familyId: 'family-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.refreshToken.findFirst).not.toHaveBeenCalled();
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('refresh: a tampered refresh token is rejected before any lookup', async () => {
      const refreshToken = jwt.sign({ sub: 'user-1', familyId: 'family-1' }, { secret: 'not-the-refresh-secret' });

      await expect(service.refresh(refreshToken)).rejects.toThrow('Invalid refresh token');
      expect(sessions.findLive).not.toHaveBeenCalled();
    });

    it('refresh: rotation keeps the session id and never extends past its absolute expiry', async () => {
      const refreshToken = jwt.sign({ sub: 'user-1', familyId: SESSION_ID }, { secret: process.env.JWT_REFRESH_SECRET });
      const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
      prisma.refreshToken.findFirst.mockResolvedValue({ id: 'rt-1', tokenHash, revokedAt: null });
      tenantPrisma.forTenant.mockResolvedValue({ id: 'user-1', organizationId: 'org-1', role: 'org_admin', status: 'active' });

      const result = await service.refresh(refreshToken);

      expect(sessions.findLive).toHaveBeenCalledWith(SESSION_ID, 'user-1');
      expect((jwt.decode(result.accessToken) as { sid: string }).sid).toBe(SESSION_ID);
      expect(prisma.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ familyId: SESSION_ID, expiresAt: absoluteExpiresAt }),
      });
    });

    it('logout ends the session behind the refresh token', async () => {
      const refreshToken = jwt.sign({ sub: 'user-1', familyId: SESSION_ID }, { secret: process.env.JWT_REFRESH_SECRET });

      await service.logout(refreshToken);

      expect(sessions.revokeById).toHaveBeenCalledWith(SESSION_ID, 'user-1', 'logout');
    });
  });

  describe('tenant security policy at sign-in (YX-IAM-04/08/09)', () => {
    const ORG = { id: 'org-1', status: 'active' };
    const signIn = (password = 'correct-password', meta = META) =>
      service.login({ organizationSlug: 'demo-org', email: 'admin@demo-org.test', password }, meta);
    const withUser = async (overrides: object = {}) => {
      prisma.organization.findUnique.mockResolvedValue(ORG);
      tenantPrisma.forTenant.mockResolvedValueOnce({
        id: 'user-1', email: 'admin@demo-org.test', organizationId: 'org-1', role: 'org_admin', status: 'active',
        passwordHash: await argon2.hash('correct-password'), passwordRecheckPending: false, ...overrides,
      });
      tenantPrisma.forTenant.mockResolvedValueOnce(undefined); // lastLoginAt
    };

    // Regression (organisation recon): a 403 before any credential work told an outsider the
    // organisation exists and restricts networks. Now it is the wrong-password answer, after the
    // same argon2 work -- but against a dummy hash, so it is no password oracle either.
    it('refuses sign-in from outside the desk allow-list like a wrong password, without checking it or counting it', async () => {
      setPolicy({ ipAllowlistDesk: ['198.51.100.0/24'] });
      prisma.organization.findUnique.mockResolvedValue(ORG);
      (argon2.verify as jest.Mock).mockClear();

      await expect(signIn()).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
      expect(argon2.verify).toHaveBeenCalledTimes(1);
      expect(tenantPrisma.forTenant).not.toHaveBeenCalled(); // the account is never looked up
      expect(loginProtection.reserve).not.toHaveBeenCalled();
      expect(loginProtection.registerFailure).not.toHaveBeenCalled();
      expect(sessions.create).not.toHaveBeenCalled();
      expect(sessions.recordLoginEvent).toHaveBeenCalledWith(expect.objectContaining({ result: 'failed', reason: 'ip_not_allowed', organizationId: 'org-1' }));
    });

    it('allows sign-in from inside the desk allow-list', async () => {
      setPolicy({ ipAllowlistDesk: ['203.0.113.0/24'] });
      await withUser();
      await expect(signIn()).resolves.toEqual(expect.objectContaining({ accessToken: expect.any(String) }));
    });

    it('SSO-only: a correct password from a non-break-glass account gets the wrong-password response', async () => {
      setPolicy({ ssoOnly: true, breakGlassUserIds: ['bg-1', 'bg-2'] });
      await withUser();
      await expect(signIn()).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
      expect(loginProtection.registerFailure).toHaveBeenCalled();
      expect(sessions.create).not.toHaveBeenCalled();
      expect(sessions.recordLoginEvent).toHaveBeenCalledWith(expect.objectContaining({ result: 'failed', reason: 'sso_only' }));
    });

    it('SSO-only: a wrong password from a break-glass account is still refused', async () => {
      setPolicy({ ssoOnly: true, breakGlassUserIds: ['user-1', 'bg-2'] });
      await withUser();
      await expect(signIn('wrong-password')).rejects.toThrow(UnauthorizedException);
      expect(sessions.create).not.toHaveBeenCalled();
    });

    it('SSO-only: a break-glass account without MFA gets the wrong-password response (YX-IAM-04 needs MFA)', async () => {
      setPolicy({ ssoOnly: true, breakGlassUserIds: ['user-1', 'bg-2'] });
      await withUser();
      await expect(signIn()).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
      expect(sessions.create).not.toHaveBeenCalled();
      expect(sessions.recordLoginEvent).toHaveBeenCalledWith(expect.objectContaining({ result: 'failed', reason: 'break_glass_without_mfa' }));
    });

    it('SSO-only: a break-glass account with MFA signs in after its second factor, audited as break-glass, admins alerted', async () => {
      setPolicy({ ssoOnly: true, breakGlassUserIds: ['user-1', 'bg-2'] });
      await withUser();
      mfa.hasFactor.mockResolvedValue(true);
      mfa.loadUser.mockResolvedValue({ id: 'user-1', email: 'admin@demo-org.test', organizationId: 'org-1', role: 'org_admin', status: 'active' });
      const challenge = await signIn();
      expect(challenge).toMatchObject({ mfaRequired: true, mfaToken: 'pending-token' });
      expect(sessions.create).not.toHaveBeenCalled();
      expect(mfa.createPendingLogin).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1', breakGlass: true, method: 'password' }));

      // The pending state is what createPendingLogin stored; the factor checks out.
      mfa.loadPendingLogin.mockResolvedValue({ ...mfa.createPendingLogin.mock.calls[0][0] });
      mfa.verifyProof.mockResolvedValue('totp');
      await service.completeMfaLogin({ mfaToken: 'pending-token', factor: 'totp', code: '123456' }, META);
      expect(sessions.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1' }), 'password', META, 'totp', null);
      // The second step of a break-glass sign-in is not long-locked either.
      expect(loginProtection.reserve).toHaveBeenCalledWith('mfa', 'user-1', META.ip, { deviceId: META.deviceId, lockExempt: true, lockout: DEFAULT_LOCKOUT });
      expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'login.break_glass', metadata: { mfa: 'totp' } }));
      expect(sessions.notifyBreakGlass).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1' }), META);
      expect(sessions.recordLoginEvent).toHaveBeenCalledWith(expect.objectContaining({ result: 'success', reason: 'break_glass' }));
    });

    it('re-checks a password flagged while the breach service was down, before the session opens', async () => {
      await withUser({ passwordRecheckPending: true });
      await signIn();
      expect(passwordPolicy.recheckAfterLogin).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1' }), 'correct-password');
    });

    it('does not re-check an unflagged password', async () => {
      await withUser();
      await signIn();
      expect(passwordPolicy.recheckAfterLogin).not.toHaveBeenCalled();
    });

    it('refresh from outside the desk allow-list is refused (403) without burning the refresh token', async () => {
      deskIpAllowed.mockResolvedValue(false);
      const refreshToken = jwt.sign({ sub: 'user-1', familyId: SESSION_ID }, { secret: process.env.JWT_REFRESH_SECRET });
      const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
      prisma.refreshToken.findFirst.mockResolvedValue({ id: 'rt-1', tokenHash, revokedAt: null });
      tenantPrisma.forTenant.mockResolvedValue({ id: 'user-1', organizationId: 'org-1', role: 'recruiter', status: 'active' });

      await expect(service.refresh(refreshToken, '192.0.2.1')).rejects.toThrow(ForbiddenException);
      expect(deskIpAllowed).toHaveBeenCalledWith(tenantPrisma, expect.objectContaining({ organizationId: 'org-1' }), '192.0.2.1');
      expect(prisma.refreshToken.update).not.toHaveBeenCalled();
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('SSO sign-in from outside the desk allow-list is refused and recorded', async () => {
      deskIpAllowed.mockResolvedValue(false);
      const user = { id: 'user-1', email: 'U1@x.test', organizationId: 'org-1', role: 'recruiter', permissionProfileId: null };
      await expect(service.issueTokensForSso(user, META)).rejects.toThrow(ForbiddenException);
      expect(sessions.create).not.toHaveBeenCalled();
      expect(sessions.recordLoginEvent).toHaveBeenCalledWith(expect.objectContaining({ method: 'saml', result: 'failed', reason: 'ip_not_allowed' }));
    });

    it('a reset rejected by the password floor leaves the link unused and the password unchanged', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({ id: 'prt-1', userId: 'user-1', usedAt: null, expiresAt: new Date(Date.now() + 60_000) });
      prisma.user.findUnique.mockResolvedValue({ organizationId: 'org-1', role: 'recruiter' });
      passwordPolicy.hashNewPassword.mockRejectedValue(new BadRequestException('breached'));

      await expect(service.resetPassword({ token: 'raw-token', newPassword: 'password1234' })).rejects.toThrow(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.passwordResetToken.updateMany).not.toHaveBeenCalled();
      expect(prisma.session.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('second factor at sign-in (YX-IAM-01/03)', () => {
    const PENDING = { userId: 'user-1', method: 'password', orgSlug: 'demo-org', identifier: 'admin@demo-org.test', breakGlass: false, deviceIdHash: 'x' };
    const ACCOUNT = { id: 'user-1', email: 'admin@demo-org.test', organizationId: 'org-1', role: 'org_admin', status: 'active', permissionProfileId: null, mfaEnrolmentDueAt: new Date() };
    const PROOF = { mfaToken: 'pending-token', factor: 'totp' as const, code: '123456' };
    const withUser = async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', status: 'active' });
      tenantPrisma.forTenant.mockResolvedValueOnce({
        id: 'user-1', email: 'admin@demo-org.test', organizationId: 'org-1', role: 'org_admin', status: 'active',
        passwordHash: await argon2.hash('correct-password'), passwordRecheckPending: false,
      });
    };
    const signIn = () => service.login({ organizationSlug: 'demo-org', email: 'admin@demo-org.test', password: 'correct-password' }, META);

    beforeEach(() => {
      mfa.loadUser.mockResolvedValue(ACCOUNT);
      mfa.loadPendingLogin.mockResolvedValue(PENDING);
      mfa.verifyProof.mockResolvedValue('totp');
      mfa.consumePendingLogin.mockResolvedValue(true);
    });

    it('a correct password for an account with a factor yields a challenge, not a session; the device is not trusted yet', async () => {
      await withUser();
      mfa.hasFactor.mockResolvedValue(true);
      const outcome = await signIn();
      expect(outcome).toEqual({ mfaRequired: true, mfaToken: 'pending-token', factors: ['totp', 'recovery_code'], expiresInSeconds: 300 });
      expect(sessions.create).not.toHaveBeenCalled();
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
      // The password guess counter is cleared (the password was right) -- no device trust yet.
      expect(loginProtection.registerSuccess).toHaveBeenCalledTimes(1);
      expect(loginProtection.registerSuccess).toHaveBeenCalledWith('demo-org', 'admin@demo-org.test', META.ip);
      // The pending sign-in is bound to this device.
      expect(mfa.createPendingLogin).toHaveBeenCalledWith(expect.objectContaining({ deviceIdHash: createHash('sha256').update(META.deviceId).digest('hex') }));
    });

    it('the right second factor opens an AAL2 session and clears both lockout counters', async () => {
      tenantPrisma.forTenant.mockResolvedValueOnce(undefined); // lastLoginAt
      const result = await service.completeMfaLogin(PROOF, META);
      expect(result.accessToken).toEqual(expect.any(String));
      expect(sessions.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1' }), 'password', META, 'totp', null);
      // Both counters cleared, and this device now has its own counters (soft lock, anti-DoS).
      expect(loginProtection.registerSuccess).toHaveBeenCalledWith('mfa', 'user-1', META.ip, { deviceId: META.deviceId, trustDevice: true });
      expect(loginProtection.registerSuccess).toHaveBeenCalledWith('demo-org', 'admin@demo-org.test', META.ip, { deviceId: META.deviceId, trustDevice: true });
      expect(sessions.recordLoginEvent).toHaveBeenCalledWith(expect.objectContaining({ result: 'success', reason: 'mfa_totp' }));
      expect(result.mfa).toBeUndefined();
    });

    it('a wrong second factor counts toward lockout, is a login event and opens nothing', async () => {
      mfa.verifyProof.mockResolvedValue(null);
      await expect(service.completeMfaLogin(PROOF, META)).rejects.toThrow(UnauthorizedException);
      // Counted before the proof was checked (reserve), then the failure is registered on it.
      expect(loginProtection.reserve).toHaveBeenCalledWith('mfa', 'user-1', META.ip, { deviceId: META.deviceId, lockExempt: false, lockout: DEFAULT_LOCKOUT });
      expect(loginProtection.registerFailure).toHaveBeenCalledWith('mfa', 'user-1', META.ip, { block: null, failures: 1, lockExempt: false });
      expect(sessions.recordLoginEvent).toHaveBeenCalledWith(expect.objectContaining({ result: 'mfa_failed', method: 'totp', reason: 'mfa_invalid' }));
      expect(mfa.consumePendingLogin).not.toHaveBeenCalled();
      expect(sessions.create).not.toHaveBeenCalled();
    });

    it('the failure that starts a lock notifies the account holder', async () => {
      mfa.verifyProof.mockResolvedValue(null);
      loginProtection.registerFailure.mockResolvedValue({ failures: 10, locked: true });
      await expect(service.completeMfaLogin(PROOF, META)).rejects.toThrow(UnauthorizedException);
      expect(sessions.notifyLocked).toHaveBeenCalled();
    });

    it('a locked account is refused before the proof is even checked', async () => {
      loginProtection.reserve.mockResolvedValue({ block: { scope: 'account', retryAfterSeconds: 900 }, failures: 0, lockExempt: false });
      await expect(service.completeMfaLogin(PROOF, META)).rejects.toThrow(TooManyLoginAttemptsException);
      expect(mfa.verifyProof).not.toHaveBeenCalled();
      expect(sessions.recordLoginEvent).toHaveBeenCalledWith(expect.objectContaining({ result: 'locked' }));
    });

    it('an expired, unknown or other-device pending token is refused and logged', async () => {
      mfa.loadPendingLogin.mockResolvedValue(null);
      await expect(service.completeMfaLogin(PROOF, META)).rejects.toThrow(UnauthorizedException);
      expect(sessions.recordLoginEvent).toHaveBeenCalledWith(expect.objectContaining({ result: 'mfa_failed', reason: 'mfa_token_invalid' }));
      expect(mfa.verifyProof).not.toHaveBeenCalled();
    });

    it('a replay racing a successful proof loses (the pending token is single-use)', async () => {
      mfa.consumePendingLogin.mockResolvedValue(false);
      await expect(service.completeMfaLogin(PROOF, META)).rejects.toThrow(UnauthorizedException);
      expect(sessions.create).not.toHaveBeenCalled();
    });

    it('a deactivated account or a network outside the desk allow-list cannot finish', async () => {
      mfa.loadUser.mockResolvedValue({ ...ACCOUNT, status: 'deactivated' });
      await expect(service.completeMfaLogin(PROOF, META)).rejects.toThrow('deactivated');
      mfa.loadUser.mockResolvedValue(ACCOUNT);
      deskIpAllowed.mockResolvedValue(false);
      await expect(service.completeMfaLogin(PROOF, META)).rejects.toThrow(ForbiddenException);
      expect(mfa.verifyProof).not.toHaveBeenCalled();
    });

    it('a passkey proof uses the server-side challenge issued for this pending sign-in', async () => {
      mfa.takeLoginChallenge.mockResolvedValue('challenge-1');
      mfa.verifyProof.mockResolvedValue(null);
      const proof = { mfaToken: 'pending-token', factor: 'passkey' as const, credential: {} as never };
      await expect(service.completeMfaLogin(proof, META)).rejects.toThrow(UnauthorizedException);
      expect(mfa.takeLoginChallenge).toHaveBeenCalledWith('pending-token');
      expect(mfa.verifyProof).toHaveBeenCalledWith(ACCOUNT, proof, 'challenge-1');
    });

    it('without a factor, a sensitive account signs in and is told when enrolment becomes mandatory', async () => {
      await withUser();
      tenantPrisma.forTenant.mockResolvedValueOnce(undefined); // lastLoginAt
      mfa.mfaRequiredFor.mockResolvedValue(true);
      const outcome = (await signIn()) as SignedIn;
      expect(outcome.accessToken).toEqual(expect.any(String));
      expect(outcome.mfa).toEqual({ required: true, enrolmentDueAt: ACCOUNT.mfaEnrolmentDueAt });
    });

    it('SSO sign-in still needs the enrolled YukthiX factor', async () => {
      mfa.hasFactor.mockResolvedValue(true);
      const outcome = await service.issueTokensForSso({ id: 'user-1', email: 'U@x.test', organizationId: 'org-1', role: 'recruiter', permissionProfileId: null }, META);
      expect(outcome).toMatchObject({ mfaRequired: true });
      expect(mfa.createPendingLogin).toHaveBeenCalledWith(expect.objectContaining({ method: 'saml', identifier: 'u@x.test' }));
      expect(sessions.create).not.toHaveBeenCalled();
    });

    it('an IdP that asserted MFA opens an AAL2 (idp) session directly, even with a YukthiX factor enrolled (P12 §3)', async () => {
      mfa.hasFactor.mockResolvedValue(true);
      prisma.refreshToken.create.mockResolvedValue({ id: 'rt-1' });
      const user = { id: 'user-1', email: 'U@x.test', organizationId: 'org-1', role: 'recruiter', permissionProfileId: null };
      const outcome = await service.issueTokensForSso(user, META, { method: 'oidc', mfaAsserted: true });
      expect(outcome).toHaveProperty('accessToken');
      expect(sessions.create).toHaveBeenCalledWith(user, 'oidc', META, 'idp', null);
      expect(mfa.createPendingLogin).not.toHaveBeenCalled();
      expect(sessions.recordLoginEvent).toHaveBeenCalledWith(expect.objectContaining({ result: 'success', method: 'oidc', reason: 'mfa_idp' }));
    });

    it('the session remembers which identity provider signed it in (so disabling the IdP ends it)', async () => {
      prisma.refreshToken.create.mockResolvedValue({ id: 'rt-1' });
      const user = { id: 'user-1', email: 'U@x.test', organizationId: 'org-1', role: 'recruiter', permissionProfileId: null };
      await service.issueTokensForSso(user, META, { method: 'oidc', mfaAsserted: false, identityProviderId: 'idp-9' });
      expect(sessions.create).toHaveBeenCalledWith(user, 'oidc', META, undefined, 'idp-9');

      mfa.hasFactor.mockResolvedValue(true);
      await service.issueTokensForSso(user, META, { method: 'oidc', mfaAsserted: false, identityProviderId: 'idp-9' });
      expect(mfa.createPendingLogin).toHaveBeenCalledWith(expect.objectContaining({ identityProviderId: 'idp-9' }));
    });

    // Regression: break-glass accounts are the way in when the IdP is the problem; an IdP's own
    // MFA claim never stands in for their YukthiX factor.
    it('IdP-asserted MFA is ignored for a break-glass account: its YukthiX factor is still owed', async () => {
      setPolicy({ ssoOnly: true, breakGlassUserIds: ['user-1', 'user-2'] });
      mfa.hasFactor.mockResolvedValue(true);
      const user = { id: 'user-1', email: 'U@x.test', organizationId: 'org-1', role: 'org_admin', permissionProfileId: null };
      const outcome = await service.issueTokensForSso(user, META, { method: 'oidc', mfaAsserted: true });
      expect(outcome).toMatchObject({ mfaRequired: true });
      expect(sessions.create).not.toHaveBeenCalled();
    });

    it('YukthiX staff are offered their security key only -- never a recovery code', async () => {
      mfa.loadUser.mockResolvedValue({ ...ACCOUNT, role: 'super_admin', organizationId: null });
      mfa.usableFactors.mockResolvedValue([{ type: 'passkey' }]);
      prisma.organization.findUnique.mockResolvedValue(null);
      tenantPrisma.forTenant.mockResolvedValueOnce({
        id: 'user-1', email: 'root@platform.test', organizationId: null, role: 'super_admin', status: 'active', passwordHash: await argon2.hash('correct-password'),
      });
      mfa.hasFactor.mockResolvedValue(true);
      const outcome = await service.loginPlatformStaff({ email: 'root@platform.test', password: 'correct-password' }, META);
      expect(outcome).toMatchObject({ mfaRequired: true, factors: ['passkey'] });
    });
  });

  describe('one-time-code sign-in (P12 §3 AAL1, M04 Q2) and the OTP fallback factor (YX-IAM-03)', () => {
    const ORG = { id: 'org-1', status: 'active' };
    const EMAIL = 'field@demo-org.test';
    const MOBILE = '+919876543210';
    const USER = { id: 'user-1', email: EMAIL, organizationId: 'org-1', role: 'recruiter', status: 'active', permissionProfileId: null, mfaEnrolmentDueAt: new Date(), mobileNumber: MOBILE, mobileVerifiedAt: new Date() };
    const sha = (v: string) => createHash('sha256').update(v).digest('hex');
    const start = (identifier = EMAIL, extra: object = {}, meta = META) => service.startOtpLogin({ organizationSlug: 'Demo-Org', identifier, ...extra }, meta);
    const verify = (code = '123456', otpToken = 'T'.repeat(43), identifier = EMAIL, meta = META) =>
      service.completeOtpLogin({ organizationSlug: 'demo-org', identifier, otpToken, code }, meta);
    // What startOtpLogin stored for this browser and token.
    const stored = (overrides: object = {}) => ({ userId: 'user-1', organizationId: 'org-1', channel: 'email', tokenHash: sha('T'.repeat(43)), deviceIdHash: sha(META.deviceId), ...overrides });

    beforeEach(() => {
      setPolicy({ otpSignInChannels: ['email', 'sms', 'whatsapp'], allowedFactors: ['passkey', 'totp', 'otp'] });
      prisma.organization.findUnique.mockResolvedValue(ORG);
      mfa.loadUser.mockResolvedValue(USER);
      grants.mockResolvedValue(new Set());
    });

    describe('step 1: asking for a code', () => {
      it('a known account gets a code by email; the answer carries only a token and timings', async () => {
        tenantPrisma.forTenant.mockResolvedValueOnce({ id: 'user-1', email: EMAIL, status: 'active', mobileNumber: null });
        const sent = await start(` ${EMAIL.toUpperCase()} `);
        expect(sent).toEqual({ otpToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/), expiresInSeconds: 300, resendAfterSeconds: 60 });
        expect(otp.reserveSend).toHaveBeenCalledWith(`signin\u0000demo-org\u0000${EMAIL}`, META.ip);
        expect(otp.issue).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ userId: 'user-1', channel: 'email', tokenHash: sha(sent.otpToken!), deviceIdHash: sha(META.deviceId) }));
        expect(otp.deliver).toHaveBeenCalledWith('email', EMAIL, '123456', 'sign_in', 'org-1', { userId: 'user-1', fallbackEmail: null });
      });

      it('no enumeration: an unknown account, an inactive one and an unknown organisation get the same answer and the same limits, and nothing is sent', async () => {
        tenantPrisma.forTenant.mockResolvedValueOnce({ id: 'user-2', email: EMAIL, status: 'deactivated', mobileNumber: null });
        const inactive = await start();
        tenantPrisma.forTenant.mockResolvedValueOnce(null);
        const unknown = await start('nobody@demo-org.test');
        prisma.organization.findUnique.mockResolvedValue(null);
        const noOrg = await start();
        for (const answer of [inactive, unknown, noOrg]) {
          expect(Object.keys(answer).sort()).toEqual(['expiresInSeconds', 'otpToken', 'resendAfterSeconds']);
        }
        expect(otp.reserveSend).toHaveBeenCalledTimes(3);
        expect(otp.issue).toHaveBeenCalledTimes(3);
        for (const [, data] of otp.issue.mock.calls) expect(data.userId).toBe('');
        expect(otp.deliver).not.toHaveBeenCalled();
      });

      it('a mobile number is normalised to E.164 and matched only against verified numbers', async () => {
        tenantPrisma.forTenant.mockImplementationOnce(async (_ctx: unknown, fn: (tx: unknown) => unknown) =>
          fn({ user: { findFirst: async (args: { where: unknown }) => (expect(args.where).toEqual({ organizationId: 'org-1', mobileNumber: MOBILE, mobileVerifiedAt: { not: null } }), USER) } }),
        );
        await start('098765 43210', { channel: 'whatsapp' });
        // The company allows email codes, so a code that can't be texted goes to the account's email.
        expect(otp.deliver).toHaveBeenCalledWith('whatsapp', MOBILE, '123456', 'sign_in', 'org-1', { userId: USER.id, fallbackEmail: USER.email });
      });

      it('no email fallback for a texted code when the company does not allow email codes (YX-NTF-07)', async () => {
        setPolicy({ otpSignInChannels: ['sms'] });
        tenantPrisma.forTenant.mockResolvedValueOnce(USER);
        await start(MOBILE, { channel: 'sms' });
        expect(otp.deliver).toHaveBeenCalledWith('sms', MOBILE, '123456', 'sign_in', 'org-1', { userId: USER.id, fallbackEmail: null });
      });

      // Regression (organisation recon): "not turned on" (400) vs a normal answer told an outsider
      // which organisations exist and how they are set up. Now: the unknown-organisation answer,
      // nothing sent, the real reason logged.
      it('what the company has not turned on (or SSO-only) answers like an unknown organisation, sends nothing, and is logged', async () => {
        const answers = [];
        setPolicy({ otpSignInChannels: ['email'] });
        answers.push(await start(MOBILE));
        setPolicy({ otpSignInChannels: [] });
        answers.push(await start());
        setPolicy({ otpSignInChannels: ['email'], ssoOnly: true });
        answers.push(await start());
        for (const answer of answers) expect(Object.keys(answer).sort()).toEqual(['expiresInSeconds', 'otpToken', 'resendAfterSeconds']);
        for (const [, data] of otp.issue.mock.calls) expect(data).toEqual(expect.objectContaining({ userId: '', organizationId: '' }));
        expect(otp.deliver).not.toHaveBeenCalled();
        expect(tenantPrisma.forTenant).not.toHaveBeenCalled(); // no account lookup
        expect(sessions.recordLoginEvent).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 'org-1', result: 'failed', reason: 'otp_disabled' }));
      });

      it('a channel with no provider is a plain 400 (a platform fact, not an organisation one)', async () => {
        otp.channelAvailable.mockReturnValue(false);
        await expect(start(MOBILE)).rejects.toThrow('not available');
        expect(otp.issue).not.toHaveBeenCalled();
      });

      it('rejects identifiers that are neither an email nor a mobile number, and mismatched channels', async () => {
        await expect(start('not-an-identifier')).rejects.toThrow(BadRequestException);
        await expect(start('12')).rejects.toThrow(BadRequestException);
        await expect(start(EMAIL, { channel: 'sms' })).rejects.toThrow('needs a mobile number');
        await expect(start(MOBILE, { channel: 'email' })).rejects.toThrow('needs an email address');
      });

      it('outside the desk IP allow-list: the unknown-organisation answer, no account lookup, nothing sent, logged', async () => {
        setPolicy({ otpSignInChannels: ['email'], ipAllowlistDesk: ['198.51.100.0/24'] });
        await expect(start()).resolves.toEqual(expect.objectContaining({ otpToken: expect.any(String) }));
        expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
        expect(otp.deliver).not.toHaveBeenCalled();
        expect(sessions.recordLoginEvent).toHaveBeenCalledWith(expect.objectContaining({ result: 'failed', method: 'otp_email', reason: 'ip_not_allowed' }));
      });

      it('every code actually sent is a login event (YX-IAM-10); decoys for unknown accounts are not', async () => {
        tenantPrisma.forTenant.mockResolvedValueOnce({ id: 'user-1', email: EMAIL, status: 'active', mobileNumber: null });
        await start();
        expect(sessions.recordLoginEvent).toHaveBeenCalledWith(
          expect.objectContaining({ organizationId: 'org-1', userId: 'user-1', identifier: EMAIL, result: 'code_sent', method: 'otp_email', meta: META }),
        );
        sessions.recordLoginEvent.mockClear();
        tenantPrisma.forTenant.mockResolvedValueOnce(null);
        await start('nobody@demo-org.test');
        expect(sessions.recordLoginEvent).not.toHaveBeenCalled();
      });

      it('a locked account or IP gets no code', async () => {
        loginProtection.check.mockResolvedValue({ scope: 'account', retryAfterSeconds: 900 });
        await expect(start()).rejects.toThrow(TooManyLoginAttemptsException);
        expect(otp.reserveSend).not.toHaveBeenCalled();
        expect(sessions.recordLoginEvent).toHaveBeenCalledWith(expect.objectContaining({ result: 'locked', method: 'otp_email' }));
      });
    });

    describe('step 2: the code', () => {
      it('the right code from the same browser signs an account without a factor in at AAL1 and clears its lockout', async () => {
        otp.peek.mockResolvedValue(stored());
        otp.check.mockResolvedValue(stored());
        tenantPrisma.forTenant.mockResolvedValueOnce(undefined); // lastLoginAt
        const outcome = (await verify()) as SignedIn;
        expect(outcome.accessToken).toEqual(expect.any(String));
        expect(sessions.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1' }), 'otp_email', META, undefined, null);
        expect(loginProtection.registerSuccess).toHaveBeenCalledWith('demo-org', EMAIL, META.ip);
        expect(loginProtection.registerSuccess).toHaveBeenCalledWith('demo-org', EMAIL, META.ip, { deviceId: META.deviceId, trustDevice: true });
        expect(sessions.recordLoginEvent).toHaveBeenCalledWith(expect.objectContaining({ result: 'success', method: 'otp_email' }));
        expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'login.success', metadata: { method: 'otp_email' } }));
      });

      it('an account with a second factor still owes it; the OTP fallback is not offered after an OTP first step', async () => {
        otp.peek.mockResolvedValue(stored());
        otp.check.mockResolvedValue(stored());
        mfa.hasFactor.mockResolvedValue(true);
        const outcome = await verify();
        expect(outcome).toEqual({ mfaRequired: true, mfaToken: 'pending-token', factors: ['totp', 'recovery_code'], expiresInSeconds: 300 });
        expect(mfa.createPendingLogin).toHaveBeenCalledWith(expect.objectContaining({ method: 'otp_email', userId: 'user-1' }));
        expect(sessions.create).not.toHaveBeenCalled();
      });

      it('a wrong code counts toward the lockout and is logged; the lock emails the holder', async () => {
        otp.peek.mockResolvedValue(stored());
        await expect(verify('000000')).rejects.toThrow(UnauthorizedException);
        expect(loginProtection.reserve).toHaveBeenCalledWith('demo-org', EMAIL, META.ip, { deviceId: META.deviceId, lockout: DEFAULT_LOCKOUT });
        expect(loginProtection.registerFailure).toHaveBeenCalledWith('demo-org', EMAIL, META.ip, { block: null, failures: 1, lockExempt: false });
        expect(sessions.recordLoginEvent).toHaveBeenCalledWith(expect.objectContaining({ result: 'failed', method: 'otp_email', reason: 'otp_invalid' }));
        loginProtection.registerFailure.mockResolvedValue({ failures: 10, locked: true });
        await expect(verify('000000')).rejects.toThrow(UnauthorizedException);
        expect(sessions.notifyLocked).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1' }), META, undefined);
        expect(sessions.create).not.toHaveBeenCalled();
      });

      it('another browser, a forged token, or an expired / never-issued code is refused without the code even being tried', async () => {
        otp.peek.mockResolvedValue(stored());
        await expect(verify('123456', 'X'.repeat(43))).rejects.toThrow(UnauthorizedException);
        await expect(verify('123456', 'T'.repeat(43), EMAIL, { ...META, deviceId: 'e'.repeat(43) })).rejects.toThrow(UnauthorizedException);
        otp.peek.mockResolvedValue(null);
        await expect(verify()).rejects.toThrow(UnauthorizedException);
        expect(otp.check).not.toHaveBeenCalled();
        expect(loginProtection.registerFailure).toHaveBeenCalledTimes(3);
      });

      it('a right guess of the decoy code stored for an unknown account still signs nobody in', async () => {
        otp.peek.mockResolvedValue(stored({ userId: '' }));
        otp.check.mockResolvedValue(stored({ userId: '' }));
        await expect(verify()).rejects.toThrow(UnauthorizedException);
        expect(sessions.create).not.toHaveBeenCalled();
      });

      it('a locked account is refused before the code is checked', async () => {
        otp.peek.mockResolvedValue(stored());
        loginProtection.reserve.mockResolvedValue({ block: { scope: 'ip', retryAfterSeconds: 600 }, failures: 0, lockExempt: false });
        await expect(verify()).rejects.toThrow(TooManyLoginAttemptsException);
        expect(otp.check).not.toHaveBeenCalled();
      });

      it('re-checks after the code: OTP turned off, account deactivated, mobile number changed', async () => {
        otp.peek.mockResolvedValue(stored());
        otp.check.mockResolvedValue(stored());
        setPolicy({ otpSignInChannels: [] });
        await expect(verify()).rejects.toThrow('not turned on');
        expect(sessions.recordLoginEvent).toHaveBeenCalledWith(expect.objectContaining({ result: 'failed', reason: 'otp_disabled' }));

        setPolicy({ otpSignInChannels: ['email', 'sms'] });
        mfa.loadUser.mockResolvedValue({ ...USER, status: 'deactivated' });
        await expect(verify()).rejects.toThrow('deactivated');

        mfa.loadUser.mockResolvedValue({ ...USER, mobileNumber: '+919000000000' });
        otp.peek.mockResolvedValue(stored({ channel: 'sms' }));
        otp.check.mockResolvedValue(stored({ channel: 'sms' }));
        await expect(verify('123456', 'T'.repeat(43), MOBILE)).rejects.toThrow(UnauthorizedException);
        expect(sessions.recordLoginEvent).toHaveBeenCalledWith(expect.objectContaining({ reason: 'mobile_changed', method: 'otp_sms' }));
        expect(sessions.create).not.toHaveBeenCalled();
      });
    });

    describe('fallback second factor (YX-IAM-03)', () => {
      it('SMS / WhatsApp to a verified mobile, never email, where the company allows OTP', async () => {
        expect(await service.otpFallbackChannels(USER, 'password')).toEqual(['sms', 'whatsapp']);
        expect(await service.otpFallbackChannels(USER, 'saml')).toEqual(['sms', 'whatsapp']);
        setPolicy({ allowedFactors: ['passkey', 'totp'] });
        expect(await service.otpFallbackChannels(USER, 'password')).toEqual([]);
      });

      it('never for System / Payroll Admin, YukthiX staff, unverified numbers, or after an OTP first step', async () => {
        grants.mockResolvedValue(new Set(['org:manage_users']));
        expect(await service.otpFallbackChannels(USER, 'password')).toEqual([]);
        grants.mockResolvedValue(new Set(['org:manage_billing']));
        expect(await service.otpFallbackChannels(USER, 'password')).toEqual([]);
        grants.mockResolvedValue(new Set());
        expect(await service.otpFallbackChannels({ ...USER, role: 'super_admin' }, 'password')).toEqual([]);
        expect(await service.otpFallbackChannels({ ...USER, mobileVerifiedAt: null }, 'password')).toEqual([]);
        expect(await service.otpFallbackChannels(USER, 'otp_email')).toEqual([]);
      });

      it('is offered at the second step and, once sent, a right code opens an AAL2 session marked otp', async () => {
        const PENDING = { userId: 'user-1', method: 'password', orgSlug: 'demo-org', identifier: EMAIL, breakGlass: false, deviceIdHash: 'x' };
        mfa.loadPendingLogin.mockResolvedValue(PENDING);
        await expect(service.sendMfaOtp({ mfaToken: 'M'.repeat(43), channel: 'sms' }, META)).resolves.toEqual({ expiresInSeconds: 300, resendAfterSeconds: 60 });
        expect(otp.reserveSend).toHaveBeenCalledWith('mfa\u0000user-1', META.ip);
        expect(otp.deliver).toHaveBeenCalledWith('sms', MOBILE, '123456', 'mfa', 'org-1', { userId: USER.id });
        expect(sessions.recordLoginEvent).toHaveBeenCalledWith(expect.objectContaining({ result: 'code_sent', method: 'otp', reason: 'mfa_sms', userId: 'user-1' }));

        otp.check.mockResolvedValue({ userId: 'user-1' });
        tenantPrisma.forTenant.mockResolvedValueOnce(undefined); // lastLoginAt
        await service.completeMfaLogin({ mfaToken: 'M'.repeat(43), factor: 'otp', code: '123456' }, META);
        expect(otp.check).toHaveBeenCalledWith(`auth:otp:mfa:${sha('M'.repeat(43))}`, '123456');
        expect(sessions.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1' }), 'password', META, 'otp', null);
        expect(mfa.verifyProof).not.toHaveBeenCalled();
      });

      it('a barred account can neither be sent a code nor use one, and the attempt counts toward the lockout', async () => {
        mfa.loadPendingLogin.mockResolvedValue({ userId: 'user-1', method: 'password', orgSlug: 'demo-org', identifier: EMAIL, breakGlass: false, deviceIdHash: 'x' });
        grants.mockResolvedValue(new Set(['org:manage_settings']));
        await expect(service.sendMfaOtp({ mfaToken: 'M'.repeat(43), channel: 'sms' }, META)).rejects.toThrow(BadRequestException);
        expect(otp.issue).not.toHaveBeenCalled();
        otp.check.mockResolvedValue({ userId: 'user-1' });
        await expect(service.completeMfaLogin({ mfaToken: 'M'.repeat(43), factor: 'otp', code: '123456' }, META)).rejects.toThrow(UnauthorizedException);
        expect(otp.check).not.toHaveBeenCalled();
        expect(loginProtection.registerFailure).toHaveBeenCalledWith('mfa', 'user-1', META.ip, expect.objectContaining({ failures: 1 }));
        expect(sessions.create).not.toHaveBeenCalled();
      });

      it('an expired or other-device pending sign-in cannot send a code', async () => {
        mfa.loadPendingLogin.mockResolvedValue(null);
        await expect(service.sendMfaOtp({ mfaToken: 'M'.repeat(43), channel: 'sms' }, META)).rejects.toThrow(UnauthorizedException);
        expect(otp.reserveSend).not.toHaveBeenCalled();
      });
    });
  });

  // Founder decision 7 Oct 2026: no company-code box. One account per company (P12 §3); with no
  // company named, the credential is checked against every active account with that email / number.
  describe('email-first sign-in (no company code)', () => {
    const EMAIL = 'divya.r@kaverifoods.in';
    let kaveriHash: string;
    let ashokHash: string;
    const account = (id: string, org: string, name: string, passwordHash: string, over: object = {}) => ({
      id,
      email: EMAIL,
      organizationId: org,
      role: 'recruiter',
      status: 'active',
      permissionProfileId: null,
      passwordHash,
      passwordRecheckPending: false,
      mobileNumber: null,
      mobileVerifiedAt: null,
      organization: { slug: `${name}-slug`, name, logoPath: null, status: 'active' },
      ...over,
    });
    let accounts: ReturnType<typeof account>[];
    const verify = argon2.verify as jest.Mock;

    beforeAll(async () => {
      kaveriHash = await argon2.hash('kaveri-password');
      ashokHash = await argon2.hash('ashok-password');
    });

    beforeEach(() => {
      accounts = [account('u-kaveri', 'org-kaveri', 'Kaveri Foods', kaveriHash), account('u-ashok', 'org-ashok', 'Ashok Textiles', ashokHash)];
      (prisma.user as any).findMany = jest.fn(async () => accounts);
      prisma.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => accounts.find((a) => a.id === where.id) ?? null);
      verify.mockClear();
    });

    const login = (password: string, meta = META) => service.login({ email: ` ${EMAIL.toUpperCase()} `, password }, meta);

    it('each company\'s password signs in to that company only, and the device remembers it', async () => {
      const kaveri = (await login('kaveri-password')) as SignedIn;
      expect(sessions.create).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'u-kaveri', organizationId: 'org-kaveri' }), 'password', META, undefined, null);
      expect(kaveri.rememberCompany).toBe('org-kaveri.signed');
      await login('ashok-password');
      expect(sessions.create).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'u-ashok', organizationId: 'org-ashok' }), 'password', META, undefined, null);
      // The email is counted across companies before anything is verified, and cleared on success.
      expect(loginProtection.reserve).toHaveBeenCalledWith('*', EMAIL, META.ip, { deviceId: META.deviceId });
      expect(loginProtection.registerSuccess).toHaveBeenCalledWith('*', EMAIL, META.ip);
      expect(loginProtection.registerSuccess).toHaveBeenCalledWith('ashok textiles-slug', EMAIL, META.ip);
    });

    it('a wrong password never lists companies: 401, a failure on each account under its own company\'s lockout', async () => {
      setPolicy({ maxFailedAttempts: 3, lockMinutes: 30 });
      await expect(login('not-the-password')).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
      expect(loginProtection.reserve).toHaveBeenCalledWith('kaveri foods-slug', EMAIL, META.ip, { deviceId: META.deviceId, lockExempt: false, lockout: { maxFailedAttempts: 3, lockMinutes: 30 } });
      expect(loginProtection.reserve).toHaveBeenCalledWith('ashok textiles-slug', EMAIL, META.ip, expect.objectContaining({ lockout: { maxFailedAttempts: 3, lockMinutes: 30 } }));
      expect(loginProtection.registerFailure).toHaveBeenCalledWith('*', EMAIL, META.ip, expect.anything());
      expect(sessions.recordLoginEvent).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 'org-kaveri', userId: 'u-kaveri', result: 'failed', reason: 'bad_password' }));
      expect(store.size).toBe(0);
    });

    it('the same password in both companies: only then the companies are listed (name and logo only), behind a single-use token', async () => {
      accounts[1].passwordHash = kaveriHash;
      const choice = (await login('kaveri-password')) as any;
      expect(choice).toEqual({
        selectionRequired: true,
        selectionToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
        companies: [
          { id: 'org-kaveri', name: 'Kaveri Foods', logoUrl: null },
          { id: 'org-ashok', name: 'Ashok Textiles', logoUrl: null },
        ],
        expiresInSeconds: 120,
      });
      expect(sessions.create).not.toHaveBeenCalled();
      expect(redis.set).toHaveBeenCalledWith(expect.stringMatching(/^auth:pick:[0-9a-f]{64}$/), expect.any(String), 'EX', 120);
      // Stored: who may be picked and a fingerprint of the password hash -- never the hash itself.
      expect(JSON.stringify([...store.values()])).not.toContain(kaveriHash);

      const signedIn = (await service.selectCompany({ selectionToken: choice.selectionToken, organizationId: 'org-ashok' }, META)) as SignedIn;
      expect(signedIn.accessToken).toEqual(expect.any(String));
      expect(sessions.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'u-ashok' }), 'password', META, undefined, null);
      // Single use.
      await expect(service.selectCompany({ selectionToken: choice.selectionToken, organizationId: 'org-kaveri' }, META)).rejects.toThrow(UnauthorizedException);
    });

    it('the choice works only on the device it was given to, only for a matched company, and not after a password change', async () => {
      accounts[1].passwordHash = kaveriHash;
      const pick = async () => ((await login('kaveri-password')) as any).selectionToken as string;

      await expect(service.selectCompany({ selectionToken: await pick(), organizationId: 'org-kaveri' }, { ...META, deviceId: 'e'.repeat(43) })).rejects.toThrow(UnauthorizedException);
      expect(sessions.recordLoginEvent).toHaveBeenLastCalledWith(expect.objectContaining({ reason: 'company_pick_device_mismatch' }));

      const token = await pick();
      await expect(service.selectCompany({ selectionToken: token, organizationId: '99999999-9999-4999-8999-999999999999' }, META)).rejects.toThrow(UnauthorizedException);
      expect(sessions.recordLoginEvent).toHaveBeenLastCalledWith(expect.objectContaining({ reason: 'company_pick_not_matched' }));
      // ...and the token was spent by the wrong pick.
      await expect(service.selectCompany({ selectionToken: token, organizationId: 'org-kaveri' }, META)).rejects.toThrow(UnauthorizedException);

      const before = await pick();
      accounts[0].passwordHash = await argon2.hash('reset-in-between');
      await expect(service.selectCompany({ selectionToken: before, organizationId: 'org-kaveri' }, META)).rejects.toThrow(UnauthorizedException);
      expect(sessions.recordLoginEvent).toHaveBeenLastCalledWith(expect.objectContaining({ userId: 'u-kaveri', reason: 'password_changed' }));
      expect(sessions.create).not.toHaveBeenCalled();
    });

    it('an unknown email costs one dummy argon2 verify and answers exactly like a wrong password', async () => {
      accounts = [];
      await expect(login('whatever')).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
      expect(verify).toHaveBeenCalledTimes(1);
      expect(sessions.recordLoginEvent).toHaveBeenCalledWith(expect.objectContaining({ organizationId: null, reason: 'unknown_user' }));
      expect(loginProtection.registerFailure).toHaveBeenCalledWith('*', EMAIL, META.ip, expect.anything());
    });

    it('an account its company has locked is not tried at all; the other company still works', async () => {
      loginProtection.check.mockImplementation(async (scope: string) => (scope === 'kaveri foods-slug' ? { scope: 'account', retryAfterSeconds: 600 } : null));
      await expect(login('kaveri-password')).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
      expect(verify.mock.calls.map(([hash]) => hash)).toEqual([ashokHash]);
      expect(sessions.recordLoginEvent).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u-kaveri', result: 'locked', reason: 'account_locked' }));
      await expect(login('ashok-password')).resolves.toHaveProperty('accessToken');
    });

    it('the email-wide lock refuses before any account is looked up', async () => {
      loginProtection.reserve.mockResolvedValueOnce({ block: { scope: 'account', retryAfterSeconds: 60 }, failures: 0, lockExempt: false, lockEvery: 10 });
      await expect(login('kaveri-password')).rejects.toThrow(TooManyLoginAttemptsException);
      expect((prisma.user as any).findMany).not.toHaveBeenCalled();
    });

    it('company rules still apply: SSO-only and the desk allow-list refuse a right password like a wrong one', async () => {
      policyLoader.mockImplementation(async (_tp: unknown, organizationId: string) =>
        organizationId === 'org-kaveri' ? { ...DEFAULT_SECURITY_POLICY, ssoOnly: true } : { ...DEFAULT_SECURITY_POLICY, ipAllowlistDesk: ['198.51.100.0/24'] },
      );
      await expect(login('kaveri-password')).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
      expect(sessions.recordLoginEvent).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u-kaveri', reason: 'sso_only' }));
      await expect(login('ashok-password')).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
      expect(sessions.recordLoginEvent).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u-ashok', reason: 'ip_not_allowed' }));
      expect(sessions.create).not.toHaveBeenCalled();
    });

    it('a picked account still owes its second factor', async () => {
      accounts[1].passwordHash = kaveriHash;
      mfa.hasFactor.mockResolvedValue(true);
      mfa.loadUser.mockResolvedValue({ ...accounts[1], mfaEnrolmentDueAt: new Date() });
      const choice = (await login('kaveri-password')) as any;
      await expect(service.selectCompany({ selectionToken: choice.selectionToken, organizationId: 'org-ashok' }, META)).resolves.toMatchObject({ mfaRequired: true });
      expect(mfa.createPendingLogin).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u-ashok', method: 'password', orgSlug: 'ashok textiles-slug', identifier: EMAIL }));
    });

    it('with an orgSlug the company path is unchanged (no cross-company lookup)', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-kaveri', status: 'active' });
      tenantPrisma.forTenant.mockResolvedValueOnce(accounts[0]);
      await expect(service.login({ organizationSlug: 'Kaveri-Foods', email: EMAIL, password: 'kaveri-password' }, META)).resolves.toHaveProperty('accessToken');
      expect((prisma.user as any).findMany).not.toHaveBeenCalled();
      expect(loginProtection.reserve).toHaveBeenCalledWith('kaveri-foods', EMAIL, META.ip, expect.anything());
      expect(loginProtection.reserve).not.toHaveBeenCalledWith('*', expect.anything(), expect.anything(), expect.anything());
    });

    it('one code to the address however many companies use it; after it is verified, the same picker rule', async () => {
      policyLoader.mockImplementation(async () => ({ ...DEFAULT_SECURITY_POLICY, otpSignInChannels: ['email'] }));
      const sent = await service.startOtpLogin({ identifier: EMAIL }, META);
      expect(Object.keys(sent).sort()).toEqual(['expiresInSeconds', 'otpToken', 'resendAfterSeconds']);
      expect(otp.reserveSend).toHaveBeenCalledWith(`signin\u0000\u0000${EMAIL}`, META.ip);
      expect(otp.deliver).toHaveBeenCalledTimes(1);
      const [key, data] = otp.issue.mock.calls[0];
      expect(data.userIds).toBe('u-kaveri,u-ashok');

      otp.peek.mockResolvedValue({ ...data, mac: 'x' });
      otp.check.mockResolvedValue({ ...data });
      const choice = (await service.completeOtpLogin({ identifier: EMAIL, otpToken: sent.otpToken!, code: '123456' }, META)) as any;
      expect(otp.check).toHaveBeenCalledWith(key, '123456');
      expect(choice.companies.map((c: { id: string }) => c.id)).toEqual(['org-kaveri', 'org-ashok']);
      await expect(service.selectCompany({ selectionToken: choice.selectionToken, organizationId: 'org-kaveri' }, META)).resolves.toHaveProperty('accessToken');
      expect(sessions.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'u-kaveri' }), 'otp_email', META, undefined, null);
    });

    it('a wrong code lists nothing and counts against each account the code was for', async () => {
      policyLoader.mockImplementation(async () => ({ ...DEFAULT_SECURITY_POLICY, otpSignInChannels: ['email'] }));
      otp.peek.mockResolvedValue({ userIds: 'u-kaveri,u-ashok', channel: 'email', tokenHash: createHash('sha256').update('T'.repeat(43)).digest('hex'), deviceIdHash: createHash('sha256').update(META.deviceId).digest('hex'), mac: 'x' });
      otp.check.mockResolvedValue(null);
      await expect(service.completeOtpLogin({ identifier: EMAIL, otpToken: 'T'.repeat(43), code: '000000' }, META)).rejects.toThrow(UnauthorizedException);
      expect(loginProtection.reserve).toHaveBeenCalledWith('kaveri foods-slug', EMAIL, META.ip, expect.anything());
      expect(loginProtection.reserve).toHaveBeenCalledWith('ashok textiles-slug', EMAIL, META.ip, expect.anything());
      expect(store.size).toBe(0);
    });

    it('nothing is sent when no company lets this address sign in by code -- same answer', async () => {
      const sent = await service.startOtpLogin({ identifier: EMAIL }, META); // default policy: codes off
      expect(Object.keys(sent).sort()).toEqual(['expiresInSeconds', 'otpToken', 'resendAfterSeconds']);
      expect(otp.deliver).not.toHaveBeenCalled();
      expect(otp.issue.mock.calls[0][1].userIds).toBe('');
    });

    it('forgot password without a company: one link per company account, naming the company', async () => {
      await service.forgotPassword({ email: EMAIL });
      await new Promise((resolve) => setImmediate(resolve));
      expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(2);
      expect(emailService.send).toHaveBeenCalledWith(expect.objectContaining({ to: EMAIL, subject: 'Reset your Kaveri Foods password', organizationId: 'org-kaveri' }));
      expect(emailService.send).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Reset your Ashok Textiles password', organizationId: 'org-ashok' }));
      // Asked on the YukthiX page: the link opens the YukthiX reset page, not the older app's.
      expect(emailService.send.mock.calls[0][0].html).toMatch(/\/yx\/reset-password\/[a-f0-9]{64}"/);
    });

    it('every reset link goes to the YukthiX reset page, with or without a typed company code', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', slug: 'demo-org', status: 'active' });
      tenantPrisma.forTenant.mockResolvedValue({ id: 'user-1', email: 'admin@demo-org.test', organizationId: 'org-1' });
      prisma.passwordResetToken.create.mockResolvedValue({});
      await service.forgotPassword({ organizationSlug: 'demo-org', email: 'admin@demo-org.test' }, true);
      await service.forgotPassword({ organizationSlug: 'demo-org', email: 'admin@demo-org.test' });
      await new Promise((resolve) => setImmediate(resolve));
      for (const [call] of emailService.send.mock.calls) {
        expect(call.html).toMatch(/\/yx\/reset-password\/[0-9a-f]{64}/);
        expect(call.html).not.toMatch(/(?<!\/yx)\/reset-password\//);
      }
    });

    // W-005: YukthiX platform staff are never reachable through a company sign-in.
    describe('YukthiX platform staff are not company accounts (W-005)', () => {
      const staff = (passwordHash: string) => ({ ...account('u-staff', 'x', 'YukthiX', passwordHash, { role: 'super_admin' }), organizationId: null, organization: null });

      it('the company lookup asks the database for company accounts only', async () => {
        await expect(login('whatever')).rejects.toThrow(UnauthorizedException);
        const where = ((prisma.user as any).findMany as jest.Mock).mock.calls[0][0].where;
        expect(where).toMatchObject({ role: { not: 'super_admin' }, organizationId: { not: null }, organization: { status: 'active' } });
        expect(where.OR).toBeUndefined();
      });

      it('even if the lookup returned one, a staff email with its right password gets the wrong-password 401 and no picker entry', async () => {
        accounts = [staff(kaveriHash) as any, account('u-kaveri', 'org-kaveri', 'Kaveri Foods', kaveriHash)];
        // Only the company account is tried, and it signs straight in: no "YukthiX" choice exists.
        await expect(login('kaveri-password')).resolves.toHaveProperty('accessToken');
        expect(sessions.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'u-kaveri' }), 'password', META, undefined, null);
        expect(verify.mock.calls.map(([hash]) => hash)).toEqual([kaveriHash]);
        expect(store.size).toBe(0);

        accounts = [staff(kaveriHash) as any];
        verify.mockClear();
        await expect(login('kaveri-password')).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
        // Same work and the same events as an unknown email; nothing is counted against the staff account.
        expect(verify).toHaveBeenCalledTimes(1);
        expect(sessions.recordLoginEvent).toHaveBeenCalledWith(expect.objectContaining({ organizationId: null, reason: 'unknown_user' }));
        expect(loginProtection.reserve).not.toHaveBeenCalledWith('', expect.anything(), expect.anything(), expect.anything());
      });

      it('one-time codes and forgot-password never reach a staff account', async () => {
        accounts = [staff(kaveriHash) as any];
        policyLoader.mockImplementation(async () => ({ ...DEFAULT_SECURITY_POLICY, otpSignInChannels: ['email'] }));
        await service.startOtpLogin({ identifier: EMAIL }, META);
        expect(otp.deliver).not.toHaveBeenCalled();
        expect(otp.issue.mock.calls[0][1].userIds).toBe('');
        await service.forgotPassword({ email: EMAIL });
        await new Promise((resolve) => setImmediate(resolve));
        expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      });
    });

    describe('the platform staff sign-in', () => {
      const STAFF_EMAIL = 'ops@yukthix.test';
      const STAFF = { id: 'u-staff', email: STAFF_EMAIL, organizationId: null, role: 'super_admin', status: 'active', permissionProfileId: null, mfaEnrolmentDueAt: new Date() };
      let staffHash: string;
      beforeAll(async () => {
        staffHash = await argon2.hash('staff-password');
      });

      it('looks up platform staff only, under YukthiX lockout, then asks for their security key', async () => {
        mfa.hasFactor.mockResolvedValue(true);
        mfa.loadUser.mockResolvedValue(STAFF);
        mfa.usableFactors.mockResolvedValue([{ type: 'passkey' }]);
        const findFirst = jest.fn().mockResolvedValue({ ...STAFF, passwordHash: staffHash });
        tenantPrisma.forTenant.mockImplementationOnce(async (_ctx: unknown, fn: (tx: unknown) => unknown) => fn({ user: { findFirst } }));
        const outcome = await service.loginPlatformStaff({ email: ` ${STAFF_EMAIL.toUpperCase()} `, password: 'staff-password' }, META);
        expect(outcome).toMatchObject({ mfaRequired: true, factors: ['passkey'] });
        expect(tenantPrisma.forTenant.mock.calls[0][0]).toEqual({ organizationId: null, isSuperAdmin: true });
        expect(findFirst).toHaveBeenCalledWith({ where: { email: STAFF_EMAIL, role: 'super_admin', organizationId: null } });
        expect(loginProtection.reserve).toHaveBeenCalledWith('', STAFF_EMAIL, META.ip, {
          deviceId: META.deviceId,
          lockout: { maxFailedAttempts: DEFAULT_SECURITY_POLICY.maxFailedAttempts, lockMinutes: DEFAULT_SECURITY_POLICY.lockMinutes },
        });
        expect(mfa.createPendingLogin).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u-staff', orgSlug: '', breakGlass: false }));
      });

      it('a wrong password and an unknown (or company) email answer the same 401 after one argon2 verify each', async () => {
        tenantPrisma.forTenant.mockResolvedValueOnce({ ...STAFF, passwordHash: staffHash });
        await expect(service.loginPlatformStaff({ email: STAFF_EMAIL, password: 'nope' }, META)).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
        expect(verify).toHaveBeenCalledTimes(1);
        tenantPrisma.forTenant.mockResolvedValueOnce(null);
        await expect(service.loginPlatformStaff({ email: EMAIL, password: 'kaveri-password' }, META)).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
        expect(verify).toHaveBeenCalledTimes(2);
        expect(sessions.recordLoginEvent).toHaveBeenCalledWith(expect.objectContaining({ organizationId: null, reason: 'unknown_user' }));
        expect(sessions.create).not.toHaveBeenCalled();
      });
    });
  });

  describe('Continue with Google / Microsoft (founder request 7 Oct 2026)', () => {
    const EMAIL = 'divya.r@kaverifoods.in';
    const account = (id: string, org: string, name: string, over: object = {}) => ({
      id,
      email: EMAIL,
      organizationId: org,
      role: 'recruiter',
      status: 'active',
      permissionProfileId: null,
      passwordHash: 'x',
      passwordRecheckPending: false,
      mobileNumber: null,
      mobileVerifiedAt: null,
      organization: { slug: `${name}-slug`, name, logoPath: null, status: 'active' },
      ...over,
    });
    let accounts: ReturnType<typeof account>[];
    let identities: { userId: string; provider: string; subject: string; id: string }[];
    let verifiedDomains: { organizationId: string; domain: string }[];
    const ON = { googleSignIn: true, microsoftSignIn: true };
    const proof = (over: object = {}) => ({
      provider: 'google' as const,
      subject: 'g-1',
      email: EMAIL,
      domainEmail: null,
      name: 'Divya',
      scopeSlug: null,
      deviceIdHash: createHash('sha256').update(META.deviceId).digest('hex'),
      ...over,
    });
    const signIn = async (over: object = {}, meta = META) => service.socialSignIn(await service.mintSocialCode(proof(over) as never), meta);

    beforeEach(() => {
      accounts = [account('u-kaveri', 'org-kaveri', 'Kaveri Foods')];
      identities = [];
      verifiedDomains = [];
      setPolicy(ON);
      (prisma.user as any).findMany = jest.fn(async ({ where }: { where: { id?: { in: string[] }; email?: string } }) =>
        accounts.filter((a) => (where.id ? where.id.in.includes(a.id) : a.email === where.email)),
      );
      prisma.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => accounts.find((a) => a.id === where.id) ?? null);
      (prisma as any).externalIdentity = {
        findMany: jest.fn(async ({ where }: { where: { provider: string; subject?: string | { not: string }; userId?: { in: string[] } } }) =>
          identities.filter(
            (i) =>
              i.provider === where.provider &&
              (typeof where.subject === 'string' ? i.subject === where.subject : where.subject ? i.subject !== where.subject.not : true) &&
              (where.userId ? where.userId.in.includes(i.userId) : true),
          ),
        ),
        findUnique: jest.fn(async ({ where }: { where: { userId_provider: { userId: string; provider: string } } }) =>
          identities.find((i) => i.userId === where.userId_provider.userId && i.provider === where.userId_provider.provider) ?? null,
        ),
        create: jest.fn(async ({ data }: { data: { userId: string; provider: string; subject: string } }) => {
          const row = { ...data, id: `l-${identities.length}` };
          identities.push(row);
          return row;
        }),
        update: jest.fn(async () => ({})),
      };
      (prisma as any).verifiedDomain = {
        findMany: jest.fn(async ({ where }: { where: { domain: string; organizationId: { in: string[] } } }) =>
          verifiedDomains.filter((d) => d.domain === where.domain && where.organizationId.in.includes(d.organizationId)),
        ),
      };
    });

    it('a verified address opens its one account: session by "google", the subject linked (audited), the second factor rules as for passwords', async () => {
      const signedIn = (await signIn()) as SignedIn;
      expect(signedIn.accessToken).toEqual(expect.any(String));
      expect(sessions.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'u-kaveri' }), 'google', META, undefined, null);
      expect(identities).toEqual([expect.objectContaining({ userId: 'u-kaveri', provider: 'google', subject: 'g-1', organizationId: 'org-kaveri' })]);
      expect(audit.record).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'user.external_identity_linked', entityId: 'u-kaveri', metadata: { provider: 'google' } }),
      );
      expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'login.success', metadata: { method: 'google' } }));
      // Signing in again only touches the link.
      await signIn();
      expect(identities).toHaveLength(1);
    });

    it('the code is single-use and only for the device that started the sign-in', async () => {
      const code = await service.mintSocialCode(proof() as never);
      expect(redis.set).toHaveBeenCalledWith(expect.stringMatching(/^auth:social:code:[0-9a-f]{64}$/), expect.any(String), 'EX', 60);
      expect([...store.keys()].join()).not.toContain(code);
      await expect(service.socialSignIn(code, { ...META, deviceId: 'e'.repeat(43) })).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
      expect(sessions.recordLoginEvent).toHaveBeenLastCalledWith(expect.objectContaining({ result: 'failed', reason: 'social_device_mismatch', method: 'google' }));
      await expect(service.socialSignIn(code, META)).rejects.toThrow(UnauthorizedException);
      expect(sessions.recordLoginEvent).toHaveBeenLastCalledWith(expect.objectContaining({ reason: 'social_code_invalid' }));
      expect(sessions.create).not.toHaveBeenCalled();
    });

    it.each([
      ['the company has not turned it on', { googleSignIn: false }],
      ['the company is SSO-only', { ...ON, ssoOnly: true }],
    ])('refused like a wrong password when %s', async (_why, policy) => {
      setPolicy(policy);
      await expect(signIn()).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
      expect(sessions.recordLoginEvent).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 'org-kaveri', userId: 'u-kaveri', result: 'failed', reason: 'social_disabled' }));
      expect(sessions.create).not.toHaveBeenCalled();
    });

    it('each provider is its own switch', async () => {
      setPolicy({ googleSignIn: true, microsoftSignIn: false });
      await expect(signIn({ provider: 'microsoft', subject: 'tid:oid' })).rejects.toThrow(UnauthorizedException);
      expect(await signIn()).toEqual(expect.objectContaining({ accessToken: expect.any(String) }));
    });

    it('no account, an unverified address, or YukthiX staff: the same refusal', async () => {
      await expect(signIn({ email: null })).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
      expect(sessions.recordLoginEvent).toHaveBeenLastCalledWith(expect.objectContaining({ organizationId: null, reason: 'unknown_user', method: 'google' }));
      accounts = [account('u-staff', null as never, 'x', { role: 'super_admin', organization: null })];
      await expect(signIn()).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
      expect(sessions.create).not.toHaveBeenCalled();
    });

    it('the linked subject wins over the address; an account linked to another subject is never opened by email', async () => {
      identities.push({ id: 'l-0', userId: 'u-kaveri', provider: 'google', subject: 'g-other' });
      await expect(signIn()).rejects.toThrow(UnauthorizedException);
      // The linked subject itself still signs in, whatever address it carries now.
      expect(await signIn({ subject: 'g-other', email: 'new-address@elsewhere.test' })).toEqual(expect.objectContaining({ accessToken: expect.any(String) }));
    });

    it('a Microsoft work sign-in name opens only accounts of a company that verified its domain', async () => {
      accounts = [account('u-kaveri', 'org-kaveri', 'Kaveri Foods'), account('u-ashok', 'org-ashok', 'Ashok Textiles')];
      verifiedDomains = [{ organizationId: 'org-kaveri', domain: 'kaverifoods.in' }];
      const ms = { provider: 'microsoft', subject: 'tid:oid', email: null, domainEmail: EMAIL };
      expect(await signIn(ms)).toEqual(expect.objectContaining({ accessToken: expect.any(String) }));
      expect(sessions.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'u-kaveri' }), 'microsoft', META, undefined, null);
      verifiedDomains = [];
      await expect(signIn({ ...ms, subject: 'tid:oid2' })).rejects.toThrow(UnauthorizedException);
    });

    it('several companies: the picker; the subject is linked to the one picked', async () => {
      accounts = [account('u-kaveri', 'org-kaveri', 'Kaveri Foods'), account('u-ashok', 'org-ashok', 'Ashok Textiles')];
      const choice = (await signIn()) as any;
      expect(choice).toEqual(expect.objectContaining({ selectionRequired: true, companies: [expect.objectContaining({ id: 'org-kaveri' }), expect.objectContaining({ id: 'org-ashok' })] }));
      expect(sessions.create).not.toHaveBeenCalled();
      await service.selectCompany({ selectionToken: choice.selectionToken, organizationId: 'org-ashok' }, META);
      expect(sessions.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'u-ashok' }), 'google', META, undefined, null);
      expect(identities).toEqual([expect.objectContaining({ userId: 'u-ashok', subject: 'g-1' })]);
    });

    it('the picker re-checks the company switch when the company is picked', async () => {
      accounts = [account('u-kaveri', 'org-kaveri', 'Kaveri Foods'), account('u-ashok', 'org-ashok', 'Ashok Textiles')];
      const choice = (await signIn()) as any;
      setPolicy({ googleSignIn: false });
      await expect(service.selectCompany({ selectionToken: choice.selectionToken, organizationId: 'org-ashok' }, META)).rejects.toThrow(UnauthorizedException);
      expect(sessions.recordLoginEvent).toHaveBeenLastCalledWith(expect.objectContaining({ userId: 'u-ashok', reason: 'social_disabled' }));
    });

    it('with the company known, only its account is a candidate', async () => {
      accounts = [account('u-kaveri', 'org-kaveri', 'Kaveri Foods'), account('u-ashok', 'org-ashok', 'Ashok Textiles')];
      expect(await signIn({ scopeSlug: 'ashok textiles-slug' })).toEqual(expect.objectContaining({ accessToken: expect.any(String) }));
      expect(sessions.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'u-ashok' }), 'google', META, undefined, null);
      expect(sessions.recordLoginEvent).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u-kaveri', reason: 'other_company' }));
    });

    it('a locked account is not opened', async () => {
      loginProtection.check.mockResolvedValue({ scope: 'account', retryAfterSeconds: 60 });
      await expect(signIn()).rejects.toThrow(UnauthorizedException);
      expect(sessions.recordLoginEvent).toHaveBeenCalledWith(expect.objectContaining({ result: 'locked', reason: 'account_locked' }));
    });

    it('MFA still applies: the second factor is owed, carrying the subject; nothing is linked yet', async () => {
      mfa.hasFactor.mockResolvedValue(true);
      mfa.loadUser.mockResolvedValue({ ...accounts[0], role: 'recruiter' });
      const outcome = await signIn();
      expect(outcome).toEqual(expect.objectContaining({ mfaRequired: true }));
      expect(mfa.createPendingLogin).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u-kaveri', method: 'google', externalSubject: 'g-1' }));
      expect(identities).toEqual([]);
      expect(sessions.create).not.toHaveBeenCalled();
    });
  });
});
