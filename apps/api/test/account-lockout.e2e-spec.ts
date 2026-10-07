import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { createHash, randomUUID } from 'crypto';
import cookieParser from 'cookie-parser';
import Redis from 'ioredis';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantPrismaService, invalidateTenantSecurityPolicy } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { LOGIN_PROTECTION_REDIS } from '../src/auth/login-protection.service';
import { markSteppedUp } from './fixtures/step-up';
import { CREDENTIAL_THROTTLE, CREDENTIAL_THROTTLE_LIMITS } from '../src/rate-limit-tiers';

// Company-configurable account lockout and admin unlock (P12 YX-IAM-07, Q8; founder decision
// 6 Oct 2026), against the real database (forced RLS, app role, CHECK constraints) and real Redis.
describe('account lockout settings and admin unlock (P12 YX-IAM-07)', () => {
  // The sign-in throttle at its PRODUCTION limits (relaxed under NODE_ENV=test elsewhere; read when
  // the app starts): the lockout must stay reachable through it. Every other test here sends each
  // request from a fresh IP, so the per IP + account budget never binds them.
  Object.assign(CREDENTIAL_THROTTLE, CREDENTIAL_THROTTLE_LIMITS);
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let redis: Redis;
  const email = { send: jest.fn().mockResolvedValue({ success: true }) };
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const WRONG = 'wrong-password-xx';
  const runId = randomUUID().slice(0, 8);
  const emailOf = (name: string) => `${name}-${runId}@lockout.test`;
  const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

  let planId: string;
  const orgs: { id: string; slug: string }[] = [];
  const users: Record<string, string> = {};
  const ADMIN_A = emailOf('admin-a');
  const RECRUITER_A = emailOf('recruiter-a');
  const ADMIN_B = emailOf('admin-b');
  // The same address in both companies: each company's counter and settings are its own.
  const SHARED = emailOf('shared');
  const orgA = () => orgs[0];
  const orgB = () => orgs[1];

  let ipSeq = 0;
  const freshIp = () => `198.18.${Math.floor(++ipSeq / 250)}.${(ipSeq % 250) + 1}`;
  const server = () => app.getHttpServer();
  const login = (slug: string, who: string, opts: { password?: string; ip?: string } = {}) =>
    request(server())
      .post('/api/v1/auth/staff/login')
      .set('X-Forwarded-For', opts.ip ?? freshIp())
      .send({ organizationSlug: slug, email: who, password: opts.password ?? PASSWORD });
  const signIn = async (slug: string, who: string, stepUp = true) => {
    const res = await login(slug, who).expect(200);
    if (stepUp) await markSteppedUp(tenantPrisma, res.body.accessToken);
    return res.body.accessToken as string;
  };
  const call = (method: 'get' | 'post' | 'patch', path: string, access: string) =>
    request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${access}`).set('X-Forwarded-For', freshIp());
  const unlock = (access: string, userId: string, reason = 'Locked out after a typo storm, confirmed by phone') =>
    call('post', `/security/users/${userId}/unlock`, access).send({ reason });

  async function setPolicy(organizationId: string, data: Partial<Prisma.TenantSecurityPolicyUncheckedCreateInput>) {
    await tenantPrisma.forTenant(SUPER, (tx) =>
      tx.tenantSecurityPolicy.upsert({ where: { organizationId }, create: { organizationId, ...data }, update: data }),
    );
    invalidateTenantSecurityPolicy(organizationId);
  }
  // `n` wrong passwords in a row, each from a fresh IP (only the account counter is in play).
  const failTimes = async (slug: string, who: string, n: number) => {
    const out: request.Response[] = [];
    for (let i = 0; i < n; i++) out.push(await login(slug, who, { password: WRONG }));
    return out;
  };
  const clearCounters = async () => {
    const keys = await redis.keys('auth:lp:*');
    if (keys.length) await redis.del(...keys);
  };

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

    planId = (await prisma.plan.create({ data: { name: `lo-plan-${runId}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const label of ['a', 'b']) {
      const org = await prisma.organization.create({ data: { name: `LO ${label}`, slug: `lo-${label}-${runId}`, planId } });
      orgs.push({ id: org.id, slug: org.slug });
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const seed: [number, string, string, string][] = [
      [0, ADMIN_A, 'org_admin', ADMIN_A],
      [0, RECRUITER_A, 'recruiter', RECRUITER_A],
      [0, SHARED, 'recruiter', `${SHARED}#a`],
      [1, ADMIN_B, 'org_admin', ADMIN_B],
      [1, SHARED, 'recruiter', `${SHARED}#b`],
    ];
    for (const [i, address, role, key] of seed) {
      const organizationId = orgs[i].id;
      users[key] = (
        await tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, (tx) =>
          tx.user.create({ data: { organizationId, email: address, passwordHash, role } }),
        )
      ).id;
    }
  });

  beforeEach(async () => {
    email.send.mockClear();
    await clearCounters();
    const ids = orgs.map((o) => o.id);
    await tenantPrisma.forTenant(SUPER, (tx) => tx.tenantSecurityPolicy.deleteMany({ where: { organizationId: { in: ids } } }));
    ids.forEach(invalidateTenantSecurityPolicy);
  });

  afterAll(async () => {
    const ids = orgs.map((o) => o.id);
    await clearCounters();
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        await tx.tenantSecurityPolicy.deleteMany({ where: { organizationId: { in: ids } } });
        await tx.refreshToken.deleteMany({ where: { user: { organizationId: { in: ids } } } });
        await tx.user.deleteMany({ where: { organizationId: { in: ids } } });
        await tx.organization.deleteMany({ where: { id: { in: ids } } });
      })
      .catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  describe('company settings (Q8: YukthiX sets the floor, companies may only be stricter)', () => {
    it('the policy API returns the defaults and the floor', async () => {
      const admin = await signIn(orgA().slug, ADMIN_A);
      const res = await call('get', '/security/policy', admin).expect(200);
      expect(res.body.policy).toMatchObject({ maxFailedAttempts: 10, lockMinutes: 15 });
      expect(res.body.floor).toMatchObject({ maxFailedAttempts: { min: 3, max: 10 }, lockMinutes: { min: 15, max: 1440 } });
    });

    it.each([[{ maxFailedAttempts: 11 }], [{ maxFailedAttempts: 2 }], [{ maxFailedAttempts: 4.5 }], [{ lockMinutes: 10 }], [{ lockMinutes: 1441 }], [{ lockMinutes: null }]])(
      'the API refuses anything outside the floor: %j',
      async (body) => {
        const admin = await signIn(orgA().slug, ADMIN_A);
        await call('patch', '/security/policy', admin).send(body).expect(400);
        expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.tenantSecurityPolicy.findUnique({ where: { organizationId: orgA().id } }))).toBeNull();
      },
    );

    it('the database refuses it too, whatever the code path', async () => {
      await expect(setPolicy(orgA().id, { maxFailedAttempts: 11 })).rejects.toThrow(/tsp_max_failed_attempts_check/);
      await expect(setPolicy(orgA().id, { maxFailedAttempts: 2 })).rejects.toThrow(/tsp_max_failed_attempts_check/);
      await expect(setPolicy(orgA().id, { lockMinutes: 10 })).rejects.toThrow(/tsp_lock_minutes_check/);
      await expect(setPolicy(orgA().id, { lockMinutes: 1441 })).rejects.toThrow(/tsp_lock_minutes_check/);
    });

    it('saves a stricter setting through the API (step-up) and audits it', async () => {
      const admin = await signIn(orgA().slug, ADMIN_A);
      const res = await call('patch', '/security/policy', admin).send({ maxFailedAttempts: 3, lockMinutes: 60 }).expect(200);
      expect(res.body.policy).toMatchObject({ maxFailedAttempts: 3, lockMinutes: 60 });
      const entry = await tenantPrisma.forTenant(SUPER, (tx) =>
        tx.auditLog.findFirstOrThrow({ where: { organizationId: orgA().id, action: 'security_policy.updated' }, orderBy: { createdAt: 'desc' } }),
      );
      expect(JSON.parse(entry.metadataJson!).changes).toMatchObject({ maxFailedAttempts: { from: 10, to: 3 }, lockMinutes: { from: 15, to: 60 } });
    });
  });

  describe('the lock follows the company setting', () => {
    it('a company setting of 3 locks on the 3rd failure, for its lock minutes, and the person is emailed', async () => {
      await setPolicy(orgA().id, { maxFailedAttempts: 3, lockMinutes: 60 });
      const [r1, r2, r3] = await failTimes(orgA().slug, RECRUITER_A, 3);
      expect([r1.status, r2.status, r3.status]).toEqual([401, 401, 401]);
      const blocked = await login(orgA().slug, RECRUITER_A).expect(429); // even the right password
      expect(blocked.body.retryAfterSeconds).toBe(3600);

      const events = await tenantPrisma.forTenant(SUPER, (tx) =>
        tx.loginEvent.findMany({ where: { organizationId: orgA().id, identifier: RECRUITER_A }, orderBy: { createdAt: 'asc' } }),
      );
      expect(events.map((e) => e.reason)).toEqual(['bad_password', 'bad_password', 'bad_password+lockout_started', 'account_locked']);
      expect(events[3]).toMatchObject({ result: 'locked', userId: users[RECRUITER_A] });
      await new Promise((r) => setTimeout(r, 100));
      expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: RECRUITER_A, subject: 'Sign-in to your YukthiX account was temporarily locked' }));
    });

    it('the second sign-in step locks under the same company setting', async () => {
      await setPolicy(orgA().id, { maxFailedAttempts: 3, lockMinutes: 30 });
      const factor = await tenantPrisma.forTenant(SUPER, (tx) =>
        tx.authenticator.create({ data: { organizationId: orgA().id, userId: users[`${SHARED}#a`], type: 'totp', label: 'test', secretEncrypted: 'unused.in.this.test' } }),
      );
      try {
        const first = await login(orgA().slug, SHARED).expect(200);
        const device = ((first.headers['set-cookie'] as unknown as string[]) ?? []).find((c) => c.startsWith('yx_device='))!.split(';')[0];
        const guess = () =>
          request(server()).post('/api/v1/auth/mfa/verify').set('Cookie', device).set('X-Forwarded-For', freshIp()).send({ mfaToken: first.body.mfaToken, factor: 'recovery_code', code: 'zzzz-zzzz-zzzz-zzzz' });
        for (let i = 0; i < 3; i++) await guess().expect(401);
        expect((await guess().expect(429)).body.retryAfterSeconds).toBe(1800);
      } finally {
        await tenantPrisma.forTenant(SUPER, (tx) => tx.authenticator.update({ where: { id: factor.id }, data: { revokedAt: new Date() } }));
      }
    });

    it("another company's setting never applies: the same address elsewhere keeps the YukthiX default", async () => {
      await setPolicy(orgA().id, { maxFailedAttempts: 3, lockMinutes: 60 });
      await failTimes(orgB().slug, SHARED, 3);
      // Company B (default 10): the 3rd failure earns only the 1 s progressive delay, no lock.
      const next = await login(orgB().slug, SHARED).expect(429);
      expect(next.body.retryAfterSeconds).toBeLessThanOrEqual(1);
      await new Promise((r) => setTimeout(r, 1100));
      await login(orgB().slug, SHARED).expect(200);
      // And B's 3 failures did not touch A's counter for the same address.
      await login(orgA().slug, SHARED).expect(200);
    });

    it('a company default of 10 still locks on the 10th failure for 15 minutes', async () => {
      const key = sha256(`${orgB().slug}\u0000${ADMIN_B}`);
      await redis.set(`auth:lp:acct:fail:${key}`, '9');
      await login(orgB().slug, ADMIN_B, { password: WRONG }).expect(401);
      expect((await login(orgB().slug, ADMIN_B).expect(429)).body.retryAfterSeconds).toBe(900);
    });

    it('unknown accounts behave exactly like real ones under the company setting (no enumeration)', async () => {
      await setPolicy(orgA().id, { maxFailedAttempts: 3, lockMinutes: 60 });
      const ghost = emailOf('nobody');
      const real = await failTimes(orgA().slug, RECRUITER_A, 3);
      const fake = await failTimes(orgA().slug, ghost, 3);
      expect(fake.map((r) => [r.status, r.body])).toEqual(real.map((r) => [r.status, r.body]));
      const [realBlocked, fakeBlocked] = [await login(orgA().slug, RECRUITER_A, { password: WRONG }), await login(orgA().slug, ghost, { password: WRONG })];
      // Same status and body; the countdown may differ by the second that passed between the calls.
      const { retryAfterSeconds: fakeWait, ...fakeRest } = fakeBlocked.body;
      const { retryAfterSeconds: realWait, ...realRest } = realBlocked.body;
      expect([fakeBlocked.status, fakeRest]).toEqual([realBlocked.status, realRest]);
      expect(Math.abs(fakeWait - realWait)).toBeLessThanOrEqual(1);
      expect(fakeWait).toBeGreaterThanOrEqual(3599);

      // An unknown organisation gets the YukthiX default (3 failures: delay only, no lock).
      const nowhere = `nowhere-${runId}`;
      await failTimes(nowhere, ghost, 3);
      expect((await login(nowhere, ghost, { password: WRONG }).expect(429)).body.retryAfterSeconds).toBeLessThanOrEqual(1);
    });
  });

  describe('one office IP: the lockout, not the sign-in throttle, stops guessing', () => {
    it('10 wrong passwords for one email from one IP lock the account and email the person', async () => {
      const ip = freshIp();
      const key = sha256(`${orgA().slug}\u0000${RECRUITER_A}`);
      const statuses: number[] = [];
      for (let i = 0; i < 10; i++) {
        // From the 3rd failure each try must wait 1, 2, 4 ... s: the person waiting it out.
        await redis.del(`auth:lp:acct:block:${key}`);
        statuses.push((await login(orgA().slug, RECRUITER_A, { password: WRONG, ip })).status);
      }
      expect(statuses).toEqual(Array(10).fill(401));
      // Locked for the company default (15 min) wherever it is tried from, even with the right password.
      expect((await login(orgA().slug, RECRUITER_A).expect(429)).body.retryAfterSeconds).toBe(900);
      await new Promise((r) => setTimeout(r, 100));
      expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: RECRUITER_A, subject: 'Sign-in to your YukthiX account was temporarily locked' }));
    });

    it('one IP trying 30 different emails is blocked by the IP rule (30 in 15 min) before the throttle ceiling', async () => {
      const ip = freshIp();
      const statuses: number[] = [];
      for (let i = 0; i < 30; i++) statuses.push((await login(orgA().slug, emailOf(`spray-${i}`), { password: WRONG, ip })).status);
      expect(statuses).toEqual(Array(30).fill(401));
      const blocked = await login(orgA().slug, ADMIN_A, { ip }).expect(429);
      expect(blocked.body.retryAfterSeconds).toBeGreaterThan(890);
    });
  });

  describe('admin unlock', () => {
    const lockRecruiter = async () => {
      await setPolicy(orgA().id, { maxFailedAttempts: 3, lockMinutes: 60 });
      await failTimes(orgA().slug, RECRUITER_A, 3);
      await login(orgA().slug, RECRUITER_A).expect(429);
    };

    it('clears the lock, is audited with the reason, logged as a login event and emailed to the person', async () => {
      const admin = await signIn(orgA().slug, ADMIN_A);
      await lockRecruiter();
      email.send.mockClear();
      const res = await unlock(admin, users[RECRUITER_A]).expect(200);
      expect(res.body).toEqual({ wasLocked: true });
      await login(orgA().slug, RECRUITER_A).expect(200);

      const audit = await tenantPrisma.forTenant(SUPER, (tx) =>
        tx.auditLog.findFirstOrThrow({ where: { organizationId: orgA().id, action: 'account.unlocked' }, orderBy: { createdAt: 'desc' } }),
      );
      expect(audit).toMatchObject({ actorUserId: users[ADMIN_A], entityType: 'user', entityId: users[RECRUITER_A] });
      expect(JSON.parse(audit.metadataJson!)).toEqual({ reason: 'Locked out after a typo storm, confirmed by phone', wasLocked: true });
      const event = await tenantPrisma.forTenant(SUPER, (tx) =>
        tx.loginEvent.findFirstOrThrow({ where: { organizationId: orgA().id, result: 'unlocked' }, orderBy: { createdAt: 'desc' } }),
      );
      expect(event).toMatchObject({ userId: users[RECRUITER_A], method: 'admin', reason: 'admin_unlock' });
      await new Promise((r) => setTimeout(r, 100));
      expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: RECRUITER_A, subject: 'Your YukthiX account was unlocked' }));
    });

    it('needs a step-up', async () => {
      const admin = await signIn(orgA().slug, ADMIN_A, false);
      await lockRecruiter();
      const res = await unlock(admin, users[RECRUITER_A]).expect(403);
      expect(res.body.code).toBe('STEP_UP_REQUIRED');
      await login(orgA().slug, RECRUITER_A).expect(429);
    });

    it("refuses another company's user (404), without org:manage_users (403), without a reason (400) and for yourself (403)", async () => {
      const admin = await signIn(orgA().slug, ADMIN_A);
      await lockRecruiter();
      const unlocks = () => tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.count({ where: { action: 'account.unlocked' } }));
      const before = await unlocks();
      await unlock(admin, users[`${SHARED}#b`]).expect(404);
      await unlock(admin, users[ADMIN_B]).expect(404);
      await unlock(admin, randomUUID()).expect(404);
      await unlock(admin, users[RECRUITER_A], '').expect(400);
      await unlock(admin, users[RECRUITER_A], '          ').expect(400);
      await call('post', `/security/users/${users[RECRUITER_A]}/unlock`, admin).send({}).expect(400);
      await unlock(admin, users[ADMIN_A]).expect(403);

      const recruiter = await signIn(orgA().slug, SHARED);
      await unlock(recruiter, users[RECRUITER_A]).expect(403);
      // An admin of company B cannot reach A's people either.
      const adminB = await signIn(orgB().slug, ADMIN_B);
      await unlock(adminB, users[RECRUITER_A]).expect(404);
      // Still locked: none of the refused calls did anything.
      await login(orgA().slug, RECRUITER_A).expect(429);
      expect(await unlocks()).toBe(before);
    });

    it('does not clear the per-IP lock, and does not reset MFA', async () => {
      const admin = await signIn(orgA().slug, ADMIN_A);
      const factor = await tenantPrisma.forTenant(SUPER, (tx) =>
        tx.authenticator.create({ data: { organizationId: orgA().id, userId: users[RECRUITER_A], type: 'totp', label: 'test', secretEncrypted: 'unused.in.this.test' } }),
      );
      try {
        await lockRecruiter();
        const badIp = '198.19.7.7';
        await redis.set(`auth:lp:ip:block:${badIp}`, '1', 'EX', 900);
        await unlock(admin, users[RECRUITER_A]).expect(200);

        expect(await redis.pttl(`auth:lp:ip:block:${badIp}`)).toBeGreaterThan(0);
        const fromBadIp = await login(orgA().slug, RECRUITER_A, { ip: badIp }).expect(429);
        expect(fromBadIp.body.retryAfterSeconds).toBeGreaterThan(800);
        const ok = await login(orgA().slug, RECRUITER_A).expect(200);
        expect(ok.body.mfaRequired).toBe(true); // the factor is still there
        const after = await tenantPrisma.forTenant(SUPER, (tx) => tx.authenticator.findUniqueOrThrow({ where: { id: factor.id } }));
        expect(after.revokedAt).toBeNull();
      } finally {
        await tenantPrisma.forTenant(SUPER, (tx) => tx.authenticator.update({ where: { id: factor.id }, data: { revokedAt: new Date() } }));
      }
    });
  });
});
