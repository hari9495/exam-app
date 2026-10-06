import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { createHash, randomUUID } from 'crypto';
import cookieParser from 'cookie-parser';
import Redis from 'ioredis';
import { JwtService } from '@nestjs/jwt';
import { createBase32Plugin } from '@otplib/core';
import { NodeCryptoPlugin } from '@otplib/plugin-crypto-node';
import { generateSync as totpAt } from '@otplib/totp';
import { base32 } from '@scure/base';
import { OrgSecretsCryptoService, PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { LOGIN_PROTECTION_REDIS, LoginProtectionService } from '../src/auth/login-protection.service';
import { markSteppedUp } from './fixtures/step-up';

// Security-review regressions for the sign-in protections, against the real database (forced
// RLS, app role) and the real Redis the lockout runs on:
//  * the lockout is counted atomically BEFORE the secret is checked, so a parallel burst from
//    many IPs cannot outrun it (password and the MFA second step);
//  * soft lock: a device that already completed a sign-in is not locked out by strangers; a
//    password reset lifts the lock; step-up failures have their own counter;
//  * a password reset cancels half-finished sign-ins; a role change ends the person's sessions.
describe('sign-in protection (P12 YX-IAM-07, ASVS V2.2 / V3.3)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let redis: Redis;
  let protection: LoginProtectionService;
  const jwt = new JwtService({});
  const email = { send: jest.fn().mockResolvedValue({ success: true }) };
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const runId = randomUUID().slice(0, 8);
  const emailOf = (name: string) => `${name}-${runId}@lp.test`;
  const OTP = { crypto: new NodeCryptoPlugin(), base32: createBase32Plugin({ encode: base32.encode, decode: base32.decode }) };
  const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'; // 20 bytes
  const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

  let planId: string;
  let org: { id: string; slug: string };
  const users: Record<string, string> = {};
  const ADMIN = emailOf('admin');
  const BURST = emailOf('burst');
  const MFA_USER = emailOf('mfa');
  const OWNER = emailOf('owner');
  const DEMOTED = emailOf('demoted');

  let ipSeq = 0;
  const freshIp = () => `2001:db8:${runId.slice(0, 4)}:${(++ipSeq).toString(16)}::9`;
  const server = () => app.getHttpServer();
  const deviceOf = (res: request.Response) =>
    ((res.headers['set-cookie'] as unknown as string[] | undefined) ?? []).find((c) => c.startsWith('yx_device='))?.split(';')[0];
  const login = (who: string, opts: { password?: string; ip?: string; device?: string } = {}) => {
    const req = request(server()).post('/api/v1/auth/staff/login').set('X-Forwarded-For', opts.ip ?? freshIp());
    if (opts.device) req.set('Cookie', opts.device);
    return req.send({ organizationSlug: org.slug, email: who, password: opts.password ?? PASSWORD });
  };
  const accountKey = (scope: string, identifier: string) => sha256(`${scope}\u0000${identifier}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue(email).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.getHttpAdapter().getInstance().set('trust proxy', true);
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    redis = moduleRef.get(LOGIN_PROTECTION_REDIS);
    protection = moduleRef.get(LoginProtectionService);

    planId = (await prisma.plan.create({ data: { name: `lp-plan-${runId}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    const created = await prisma.organization.create({ data: { name: 'LP', slug: `lp-${runId}`, planId } });
    org = { id: created.id, slug: created.slug };
    const passwordHash = await argon2.hash(PASSWORD);
    for (const [who, role] of [
      [ADMIN, 'org_admin'],
      [BURST, 'recruiter'],
      [MFA_USER, 'recruiter'],
      [OWNER, 'recruiter'],
      [DEMOTED, 'org_admin'],
    ] as const) {
      users[who] = (
        await tenantPrisma.forTenant({ organizationId: org.id, isSuperAdmin: false }, (tx) =>
          tx.user.create({ data: { organizationId: org.id, email: who, passwordHash, role } }),
        )
      ).id;
    }
    const secretEncrypted = app.get(OrgSecretsCryptoService).encrypt(SECRET);
    await tenantPrisma.forTenant(SUPER, (tx) =>
      tx.authenticator.create({ data: { organizationId: org.id, userId: users[MFA_USER], type: 'totp', label: 'Phone', secretEncrypted } }),
    );
  });

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        await tx.refreshToken.deleteMany({ where: { user: { organizationId: org.id } } });
        await tx.passwordResetToken.deleteMany({ where: { user: { organizationId: org.id } } });
        await tx.user.deleteMany({ where: { organizationId: org.id } });
        await tx.organization.deleteMany({ where: { id: org.id } });
      })
      .catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  describe('atomic, pre-emptive counting (the parallel-burst bypass)', () => {
    it('50 parallel attempts on one account: exactly 3 get through before the delay applies', async () => {
      const identifier = `burst-${runId}`;
      const results = await Promise.all(Array.from({ length: 50 }, (_, i) => protection.reserve('svc-test', identifier, `198.51.100.${i % 250}`)));
      expect(results.filter((r) => !r.block)).toHaveLength(3);
      expect(results.filter((r) => r.block?.scope === 'account')).toHaveLength(47);
      expect(results.filter((r) => !r.block).map((r) => r.failures).sort()).toEqual([1, 2, 3]);
    });

    it('the 10th counted attempt sets the 15-minute lock itself; a break-glass account gets the 60 s delay instead', async () => {
      const key = accountKey('svc-test', `lock-${runId}`);
      await redis.set(`auth:lp:acct:fail:${key}`, '9');
      expect(await protection.reserve('svc-test', `lock-${runId}`, null)).toMatchObject({ block: null, failures: 10 });
      const next = await protection.reserve('svc-test', `lock-${runId}`, null);
      expect(next.block).toEqual({ scope: 'account', retryAfterSeconds: 900 });

      const bg = accountKey('svc-test', `bg-${runId}`);
      await redis.set(`auth:lp:acct:fail:${bg}`, '9');
      await protection.reserve('svc-test', `bg-${runId}`, null, { lockExempt: true });
      expect((await protection.reserve('svc-test', `bg-${runId}`, null, { lockExempt: true })).block).toEqual({ scope: 'account', retryAfterSeconds: 60 });
    });

    it('password: a parallel burst of wrong passwords from 30 IPs checks at most 3 of them', async () => {
      const results = await Promise.all(Array.from({ length: 30 }, () => login(BURST, { password: 'wrong-password-xx' })));
      const statuses = results.map((r) => r.status);
      expect(statuses.filter((s) => s === 401)).toHaveLength(3);
      expect(statuses.filter((s) => s === 429)).toHaveLength(27);
      // Even the right password is refused now: the account is in its delay.
      await login(BURST).expect(429);
    });

    it('second step: a parallel burst of TOTP guesses with one mfaToken checks at most 3', async () => {
      const first = await login(MFA_USER).expect(200);
      expect(first.body.mfaRequired).toBe(true);
      const device = deviceOf(first)!;
      const guess = (i: number) =>
        request(server())
          .post('/api/v1/auth/mfa/verify')
          .set('Cookie', device)
          .set('X-Forwarded-For', freshIp())
          .send({ mfaToken: first.body.mfaToken, factor: 'totp', code: String(100000 + i) });
      const results = await Promise.all(Array.from({ length: 30 }, (_, i) => guess(i)));
      expect(results.filter((r) => r.status === 401).length).toBeLessThanOrEqual(3);
      expect(results.filter((r) => r.status === 429).length).toBeGreaterThanOrEqual(27);
      await redis.del(`auth:lp:acct:fail:${accountKey('mfa', users[MFA_USER])}`, `auth:lp:acct:block:${accountKey('mfa', users[MFA_USER])}`);
    });
  });

  describe('soft lock: strangers cannot lock the owner out', () => {
    it('a device that completed a sign-in keeps its own counter while the account is locked for everyone else', async () => {
      const ok = await login(OWNER).expect(200);
      const device = deviceOf(ok)!;
      // A stranger locks the account (10th failure).
      await redis.set(`auth:lp:acct:fail:${accountKey(org.slug, OWNER)}`, '9');
      await login(OWNER, { password: 'wrong-password-xx' }).expect(401);
      await login(OWNER, { password: 'wrong-password-xx' }).expect(429);
      await login(OWNER).expect(429); // the stranger's side, even with the right password
      // The owner, on their usual device, signs in.
      await login(OWNER, { device }).expect(200);
    });

    it('a password reset lifts the account lock', async () => {
      await redis.set(`auth:lp:acct:block:${accountKey(org.slug, OWNER)}`, '1', 'EX', 900);
      await login(OWNER).expect(429);
      const raw = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
      await prisma.passwordResetToken.create({ data: { userId: users[OWNER], tokenHash: sha256(raw), expiresAt: new Date(Date.now() + 600_000) } });
      await request(server()).post('/api/v1/auth/reset-password').send({ token: raw, newPassword: PASSWORD + '-new' }).expect(200);
      await login(OWNER, { password: PASSWORD + '-new' }).expect(200);
    });

    it('failed step-ups have their own counter: they cannot lock the owner\'s sign-in second step', async () => {
      // A stolen AAL1-or-better session burns step-up attempts until 'stepup' locks...
      const first = await login(MFA_USER).expect(200);
      const device = deviceOf(first)!;
      const totp = totpAt({ ...OTP, secret: SECRET, epoch: Math.floor(Date.now() / 1000) + 30 });
      const signed = await request(server()).post('/api/v1/auth/mfa/verify').set('Cookie', device).set('X-Forwarded-For', freshIp()).send({ mfaToken: first.body.mfaToken, factor: 'totp', code: totp }).expect(200);
      await redis.set(`auth:lp:acct:fail:${accountKey('stepup', users[MFA_USER])}`, '9');
      await request(server()).post('/api/v1/auth/mfa/step-up').set('Authorization', `Bearer ${signed.body.accessToken}`).set('X-Forwarded-For', freshIp()).send({ factor: 'totp', code: '000000' }).expect(401);
      await request(server()).post('/api/v1/auth/mfa/step-up').set('Authorization', `Bearer ${signed.body.accessToken}`).set('X-Forwarded-For', freshIp()).send({ factor: 'totp', code: '000000' }).expect(429);
      // ...but the sign-in second step is a different counter.
      expect(await redis.exists(`auth:lp:acct:block:${accountKey('mfa', users[MFA_USER])}`)).toBe(0);
    });
  });

  describe('invalidation', () => {
    // Regression: an mfaToken won with the old password stayed usable for 5 minutes after a reset.
    it('a password reset cancels a half-finished sign-in made with the old password', async () => {
      const first = await login(MFA_USER).expect(200);
      const device = deviceOf(first)!;
      const raw = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
      await prisma.passwordResetToken.create({ data: { userId: users[MFA_USER], tokenHash: sha256(raw), expiresAt: new Date(Date.now() + 600_000) } });
      await request(server()).post('/api/v1/auth/reset-password').send({ token: raw, newPassword: PASSWORD + '-two' }).expect(200);

      const totp = totpAt({ ...OTP, secret: SECRET, epoch: Math.floor(Date.now() / 1000) + 60 });
      await request(server()).post('/api/v1/auth/mfa/verify').set('Cookie', device).set('X-Forwarded-For', freshIp()).send({ mfaToken: first.body.mfaToken, factor: 'totp', code: totp }).expect(401);
      // A reset link is single-use: the same token again changes nothing.
      await request(server()).post('/api/v1/auth/reset-password').send({ token: raw, newPassword: PASSWORD + '-three' }).expect(400);
    });

    // Regression: a demoted admin kept role=org_admin in their access token until it expired.
    it('a role change ends the person\'s sessions at once', async () => {
      const admin = await login(ADMIN).expect(200);
      await markSteppedUp(tenantPrisma, admin.body.accessToken);
      const demoted = await login(DEMOTED).expect(200);
      await request(server()).get('/api/v1/security/sessions').set('Authorization', `Bearer ${demoted.body.accessToken}`).expect(200);

      await request(server()).patch(`/api/v1/users/${users[DEMOTED]}`).set('Authorization', `Bearer ${admin.body.accessToken}`).send({ role: 'recruiter' }).expect(200);

      await request(server()).get('/api/v1/security/sessions').set('Authorization', `Bearer ${demoted.body.accessToken}`).expect(401);
      const { sid } = jwt.decode(demoted.body.accessToken) as { sid: string };
      expect((await tenantPrisma.forTenant(SUPER, (tx) => tx.session.findUniqueOrThrow({ where: { id: sid } }))).revokedReason).toBe('privileges_changed');
      const audit = await tenantPrisma.forTenant(SUPER, (tx) =>
        tx.auditLog.findFirstOrThrow({ where: { organizationId: org.id, action: 'user.updated', entityId: users[DEMOTED] }, orderBy: { createdAt: 'desc' } }),
      );
      expect(JSON.parse(audit.metadataJson!).changes).toEqual({ role: { from: 'org_admin', to: 'recruiter' } });
    });
  });
});
