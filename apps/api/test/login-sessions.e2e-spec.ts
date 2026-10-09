import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { createHash, randomUUID } from 'crypto';
import cookieParser from 'cookie-parser';
import Redis from 'ioredis';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';

// P12 Part 1a end to end, against the real database (forced RLS, app role) and real Redis:
// server-side sessions (YX-IAM-06), login protection (YX-IAM-07), login events (YX-IAM-10).
describe('Staff sessions, login events and lockout (P12 YX-IAM-06/07/10)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let redis: Redis;
  const jwt = new JwtService({});
  const email = { send: jest.fn().mockResolvedValue({ success: true }) };
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';

  let planId: string;
  const orgs: { id: string; slug: string }[] = [];
  let slugA: string;
  let slugB: string;
  const emailOf = (name: string) => `${name}-${runId}@login-sessions.test`;
  const runId = randomUUID().slice(0, 8);
  const ADMIN_A = emailOf('admin-a');
  const RECRUITER_A = emailOf('recruiter-a');
  const ADMIN_B = emailOf('admin-b');

  // Every test gets its own client IP so per-IP counters never bleed between tests.
  let ipSeq = 0;
  const freshIp = () => `198.51.100.${++ipSeq}`;
  const server = () => app.getHttpServer();

  function login(slug: string, emailAddr: string, opts: { password?: string; ip?: string; device?: string } = {}) {
    const req = request(server())
      .post('/api/v1/auth/staff/login')
      .set('X-Forwarded-For', opts.ip ?? freshIp())
      .send({ organizationSlug: slug, email: emailAddr, password: opts.password ?? PASSWORD });
    if (opts.device) req.set('Cookie', `yx_device=${opts.device}`);
    return req;
  }

  async function signIn(slug: string, emailAddr: string, device?: string) {
    const res = await login(slug, emailAddr, { device }).expect(200);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    const refresh = cookies.find((c) => c.startsWith('refresh_token='))!.split(';')[0];
    const sid = (jwt.decode(res.body.accessToken) as { sid: string }).sid;
    return { access: res.body.accessToken as string, refreshCookie: refresh, sid };
  }

  const get = (path: string, access: string) => request(server()).get(`/api/v1${path}`).set('Authorization', `Bearer ${access}`);
  const del = (path: string, access: string) => request(server()).delete(`/api/v1${path}`).set('Authorization', `Bearer ${access}`);
  const refresh = (cookie: string) => request(server()).post('/api/v1/auth/refresh').set('Cookie', cookie).send({});
  const accountKey = (slug: string, emailAddr: string) =>
    createHash('sha256').update(`${slug.toLowerCase()}\u0000${emailAddr.toLowerCase()}`).digest('hex');
  const flush = () => new Promise((r) => setImmediate(r));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue(email).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    // X-Forwarded-For becomes req.ip, so each test can present its own client address.
    app.getHttpAdapter().getInstance().set('trust proxy', true);
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
    process.env.JWT_ACCESS_SECRET ??= 'unused';

    planId = (await prisma.plan.create({ data: { name: `ls-plan-${runId}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const label of ['a', 'b']) {
      const org = await prisma.organization.create({ data: { name: `LS ${label}`, slug: `ls-${label}-${runId}`, planId } });
      orgs.push({ id: org.id, slug: org.slug });
    }
    [slugA, slugB] = orgs.map((o) => o.slug);
    const passwordHash = await argon2.hash(PASSWORD);
    const users: [number, string, string][] = [
      [0, ADMIN_A, 'org_admin'],
      [0, RECRUITER_A, 'recruiter'],
      [1, ADMIN_B, 'org_admin'],
    ];
    for (const [i, emailAddr, role] of users) {
      const organizationId = orgs[i].id;
      await tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, (tx) =>
        tx.user.create({ data: { organizationId, email: emailAddr, passwordHash, role } }),
      );
    }
  });

  // Each test starts with no account counters (company and, W-016, the email's own across companies).
  beforeEach(async () => {
    email.send.mockClear();
    const keys = await redis.keys('auth:lp:acct:*');
    if (keys.length) await redis.del(...keys);
  });

  afterAll(async () => {
    const ids = orgs.map((o) => o.id);
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      await tx.refreshToken.deleteMany({ where: { user: { organizationId: { in: ids } } } });
      await tx.user.deleteMany({ where: { organizationId: { in: ids } } }); // sessions cascade
    }).catch(() => undefined);
    await tenantPrisma.forTenant(SUPER, (tx) => tx.organization.deleteMany({ where: { id: { in: ids } } })).catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    redis.disconnect();
    await app.close();
  });

  describe('server-side sessions (YX-IAM-06)', () => {
    it('a sign-in creates a session that access and refresh tokens are bound to', async () => {
      const s = await signIn(slugA, ADMIN_A);
      const row = await tenantPrisma.forTenant(SUPER, (tx) => tx.session.findUniqueOrThrow({ where: { id: s.sid } }));
      expect(row).toMatchObject({ organizationId: orgs[0].id, method: 'password', assuranceLevel: 'aal1', revokedAt: null });
      expect(row.deviceIdHash).toMatch(/^[0-9a-f]{64}$/);
      // Floor (P12 Q8): idle 30 min by default, absolute at most 12 h.
      expect(row.idleTimeoutSeconds).toBe(1800);
      expect(row.absoluteExpiresAt.getTime() - row.createdAt.getTime()).toBeLessThanOrEqual(12 * 3600 * 1000);

      const mine = await get('/auth/sessions', s.access).expect(200);
      expect(mine.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: s.sid, current: true })]));
      expect(JSON.stringify(mine.body)).not.toContain('deviceIdHash');

      const rotated = await refresh(s.refreshCookie).expect(200);
      expect((jwt.decode(rotated.body.accessToken) as { sid: string }).sid).toBe(s.sid);
    });

    it('logout kills the access token at once, not after its 15 minutes', async () => {
      const s = await signIn(slugA, ADMIN_A);
      await get('/auth/sessions', s.access).expect(200);
      await request(server()).post('/api/v1/auth/logout').set('Cookie', s.refreshCookie).send({}).expect(200);
      await get('/auth/sessions', s.access).expect(401);
      await refresh(s.refreshCookie).expect(401);
    });

    it('revoking one of my sessions kills its tokens; revoke-others keeps only the current one', async () => {
      const a = await signIn(slugA, RECRUITER_A);
      const b = await signIn(slugA, RECRUITER_A);
      const c = await signIn(slugA, RECRUITER_A);

      await del(`/auth/sessions/${b.sid}`, a.access).expect(204);
      await get('/auth/sessions', b.access).expect(401);
      await refresh(b.refreshCookie).expect(401);
      await get('/auth/sessions', c.access).expect(200);

      const res = await request(server()).post('/api/v1/auth/sessions/revoke-others').set('Authorization', `Bearer ${a.access}`).expect(200);
      expect(res.body.revoked).toBeGreaterThanOrEqual(1);
      await get('/auth/sessions', c.access).expect(401);
      await get('/auth/sessions', a.access).expect(200);
    });

    it("I cannot revoke someone else's session through my own endpoint", async () => {
      const mine = await signIn(slugA, RECRUITER_A);
      const theirs = await signIn(slugA, ADMIN_A);
      await del(`/auth/sessions/${theirs.sid}`, mine.access).expect(404);
      await get('/auth/sessions', theirs.access).expect(200);
    });

    it('an idle session and an absolutely expired session are both dead for access and refresh', async () => {
      const idle = await signIn(slugA, ADMIN_A);
      const old = await signIn(slugA, ADMIN_A);
      const past = new Date(Date.now() - 1000);
      await tenantPrisma.forTenant(SUPER, async (tx) => {
        await tx.session.update({ where: { id: idle.sid }, data: { idleExpiresAt: past } });
        await tx.session.update({ where: { id: old.sid }, data: { absoluteExpiresAt: past } });
      });
      for (const s of [idle, old]) {
        await get('/auth/sessions', s.access).expect(401);
        await refresh(s.refreshCookie).expect(401);
      }
    });

    it('activity slides the idle window but never past the absolute expiry', async () => {
      const s = await signIn(slugA, ADMIN_A);
      const soon = new Date(Date.now() + 5 * 60 * 1000);
      await tenantPrisma.forTenant(SUPER, (tx) =>
        tx.session.update({ where: { id: s.sid }, data: { lastSeenAt: new Date(Date.now() - 120_000), absoluteExpiresAt: soon } }),
      );
      await get('/auth/sessions', s.access).expect(200);
      const row = await tenantPrisma.forTenant(SUPER, (tx) => tx.session.findUniqueOrThrow({ where: { id: s.sid } }));
      expect(row.lastSeenAt.getTime()).toBeGreaterThan(Date.now() - 10_000);
      expect(row.idleExpiresAt.getTime()).toBe(soon.getTime());
    });

    it('rejects forged and pre-sessions access tokens', async () => {
      const victim = await signIn(slugA, ADMIN_A);
      const attacker = await signIn(slugA, RECRUITER_A);
      const secret = process.env.JWT_ACCESS_SECRET!;
      const claims = jwt.decode(attacker.access) as Record<string, unknown>;
      const { iat: _iat, exp: _exp, ...base } = claims;
      // Signed correctly, but pointing at another user's session: sid and sub must match.
      const crossed = jwt.sign({ ...base, sid: victim.sid }, { secret, expiresIn: 60 });
      await get('/auth/sessions', crossed).expect(401);
      const { sid: _sid, ...noSid } = base;
      await get('/auth/sessions', jwt.sign(noSid, { secret, expiresIn: 60 })).expect(401);
      await get('/auth/sessions', jwt.sign(base, { secret: 'wrong-secret', expiresIn: 60 })).expect(401);
    });

    it('refresh-token reuse revokes the whole session, including its live access token', async () => {
      const s = await signIn(slugA, ADMIN_A);
      const rotated = await refresh(s.refreshCookie).expect(200);
      // Push the rotation outside the 10 s concurrent-tab grace window.
      await prisma.refreshToken.updateMany({ where: { familyId: s.sid, revokedAt: { not: null } }, data: { revokedAt: new Date(Date.now() - 60_000) } });
      await refresh(s.refreshCookie).expect(401);
      await get('/auth/sessions', rotated.body.accessToken).expect(401);
      const row = await tenantPrisma.forTenant(SUPER, (tx) => tx.session.findUniqueOrThrow({ where: { id: s.sid } }));
      expect(row.revokedReason).toBe('refresh_token_reuse');
    });

    it('deactivating a user ends their sessions immediately', async () => {
      const victim = await signIn(slugA, RECRUITER_A);
      const admin = await signIn(slugA, ADMIN_A);
      const userId = (jwt.decode(victim.access) as { sub: string }).sub;
      const post = (path: string) => request(server()).post(`/api/v1/users/${userId}/${path}`).set('Authorization', `Bearer ${admin.access}`);
      await post('deactivate').expect(200);
      await get('/auth/sessions', victim.access).expect(401);
      await refresh(victim.refreshCookie).expect(401);
      await post('reactivate').expect(200);
    });
  });

  describe('new-device alert (YX-IAM-07)', () => {
    it('emails the user when a known account signs in from a device it has never used, not otherwise', async () => {
      const deviceOne = 'D'.repeat(43);
      const deviceTwo = 'E'.repeat(43);
      await signIn(slugB, ADMIN_B, deviceOne); // whatever came before, this device is now known
      email.send.mockClear();

      await signIn(slugB, ADMIN_B, deviceOne);
      await flush();
      expect(email.send).not.toHaveBeenCalled();

      await signIn(slugB, ADMIN_B, deviceTwo);
      await flush();
      expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: ADMIN_B, subject: expect.stringMatching(/new sign-in/i) }));

      const admin = await signIn(slugB, ADMIN_B, deviceTwo);
      const history = await get('/auth/login-history?result=success', admin.access).expect(200);
      expect(history.body.data.some((e: { newDevice: boolean }) => e.newDevice)).toBe(true);
    });
  });

  describe('login protection (YX-IAM-07)', () => {
    it('progressive delay: from the 3rd failure the account must wait, whatever the password', async () => {
      const ip = freshIp();
      for (let i = 0; i < 3; i++) await login(slugA, RECRUITER_A, { password: 'wrong', ip }).expect(401);
      const blocked = await login(slugA, RECRUITER_A, { ip }).expect(429); // correct password, still refused
      expect(blocked.body.retryAfterSeconds).toBeGreaterThanOrEqual(1);
      await redis.del(`auth:lp:acct:fail:${accountKey(slugA, RECRUITER_A)}`, `auth:lp:acct:block:${accountKey(slugA, RECRUITER_A)}`);
    });

    it('10 consecutive failures lock the account temporarily and notify the user; it is recorded', async () => {
      const ip = freshIp();
      const key = accountKey(slugA, ADMIN_A);
      for (let i = 1; i <= 10; i++) {
        // Skip the progressive delays (the company's and the email's own, W-016), keep the counts.
        await redis.del(`auth:lp:acct:block:${key}`, `auth:lp:acct:block:${accountKey('*', ADMIN_A)}`);
        await login(slugA, ADMIN_A, { password: `wrong-${i}`, ip }).expect(401);
      }
      await flush();
      expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: ADMIN_A, subject: expect.stringMatching(/locked/i) }));
      expect(await redis.ttl(`auth:lp:acct:block:${key}`)).toBeGreaterThan(14 * 60);

      // Locked even with the right password, from any IP.
      const res = await login(slugA, ADMIN_A, { ip: freshIp() }).expect(429);
      expect(res.body.retryAfterSeconds).toBeGreaterThan(14 * 60);

      const events = await tenantPrisma.forTenant({ organizationId: orgs[0].id, isSuperAdmin: false }, (tx) =>
        tx.loginEvent.findMany({ where: { identifier: ADMIN_A.toLowerCase() }, orderBy: { createdAt: 'desc' }, take: 2 }),
      );
      expect(events.map((e) => [e.result, e.reason])).toEqual([
        ['locked', 'account_locked'],
        ['failed', 'bad_password+lockout_started'],
      ]);
      await redis.del(...[key, accountKey('*', ADMIN_A)].flatMap((k) => [`auth:lp:acct:fail:${k}`, `auth:lp:acct:block:${k}`]));
      await login(slugA, ADMIN_A).expect(200);
    });

    it('an unknown account gets exactly the same responses (no user enumeration)', async () => {
      const ghost = emailOf('ghost');
      const real = RECRUITER_A;
      const run = async (who: string) => {
        const ip = freshIp();
        const statuses: number[] = [];
        const bodies: unknown[] = [];
        for (let i = 0; i < 4; i++) {
          const r = await login(slugA, who, { password: 'wrong', ip });
          statuses.push(r.status);
          bodies.push({ ...r.body, retryAfterSeconds: r.body.retryAfterSeconds === undefined ? undefined : 'n' });
        }
        const keys = [accountKey(slugA, who), accountKey('*', who)];
        await redis.del(...keys.flatMap((k) => [`auth:lp:acct:fail:${k}`, `auth:lp:acct:block:${k}`]));
        return { statuses, bodies };
      };
      const known = await run(real);
      const unknown = await run(ghost);
      expect(unknown).toEqual(known);
      expect(known.statuses).toEqual([401, 401, 401, 429]);
    });

    it('30 failures from one IP lock that IP for every account, but not other IPs', async () => {
      const ip = freshIp();
      for (let i = 0; i < 30; i++) {
        await login(slugA, emailOf(`spray-${i}`), { password: 'wrong', ip }).expect(401);
      }
      await login(slugA, ADMIN_A, { ip }).expect(429); // correct credentials, locked IP
      await login(slugA, ADMIN_A, { ip: freshIp() }).expect(200);
      await redis.del(`auth:lp:ip:block:${ip}`, `auth:lp:ip:fail:${ip}`);
    });
  });

  describe('login events and admin views (YX-IAM-10) under tenant isolation', () => {
    it('my login history shows my own attempts only', async () => {
      const ip = freshIp();
      await login(slugA, RECRUITER_A, { password: 'wrong', ip }).expect(401);
      const s = await signIn(slugA, RECRUITER_A);
      const res = await get('/auth/login-history', s.access).expect(200);
      const userId = (jwt.decode(s.access) as { sub: string }).sub;
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data.every((e: { userId: string }) => e.userId === userId)).toBe(true);
      expect(res.body.data.some((e: { result: string }) => e.result === 'failed')).toBe(true);
      await redis.del(`auth:lp:acct:fail:${accountKey(slugA, RECRUITER_A)}`);
    });

    it("an admin sees and revokes sessions in their tenant, and cannot touch another tenant's", async () => {
      const adminA = await signIn(slugA, ADMIN_A);
      const adminB = await signIn(slugB, ADMIN_B);
      const recruiter = await signIn(slugA, RECRUITER_A);

      const listA = await get('/security/sessions', adminA.access).expect(200);
      expect(listA.body.data.map((s: { id: string }) => s.id)).toContain(recruiter.sid);
      const listB = await get('/security/sessions', adminB.access).expect(200);
      expect(listB.body.data.map((s: { id: string }) => s.id)).not.toContain(recruiter.sid);

      await del(`/security/sessions/${recruiter.sid}`, adminB.access).expect(404); // wrong tenant
      await get('/auth/sessions', recruiter.access).expect(200);
      await del(`/security/sessions/${recruiter.sid}`, adminA.access).expect(204);
      await get('/auth/sessions', recruiter.access).expect(401);
    });

    it('a recruiter has no admin views', async () => {
      const r = await signIn(slugA, RECRUITER_A);
      await get('/security/sessions', r.access).expect(403);
      await get('/security/login-events', r.access).expect(403);
      await del(`/security/sessions/${r.sid}`, r.access).expect(403);
    });

    it('tenant login events are filterable and never include another tenant', async () => {
      await login(slugB, ADMIN_B, { password: 'wrong' }).expect(401);
      await redis.del(`auth:lp:acct:fail:${accountKey(slugB, ADMIN_B)}`);
      const adminA = await signIn(slugA, ADMIN_A);
      const res = await get('/security/login-events?result=failed&pageSize=100', adminA.access).expect(200);
      expect(res.body.data.every((e: { result: string }) => e.result === 'failed')).toBe(true);
      expect(res.body.data.some((e: { identifier: string }) => e.identifier === ADMIN_B.toLowerCase())).toBe(false);
      const unsuccessful = await get('/security/login-events?result=unsuccessful&method=password&pageSize=100', adminA.access).expect(200);
      expect(unsuccessful.body.data.length).toBeGreaterThan(0);
      expect(unsuccessful.body.data.every((e: { result: string; method: string }) => e.result !== 'success' && e.method === 'password')).toBe(true);
      await get('/security/login-events?method=oidc', adminA.access).expect(200);
      await get('/security/login-events?method=bogus', adminA.access).expect(400);
      await get('/security/login-events?result=bogus', adminA.access).expect(400);
      await get('/security/login-events?userId=not-a-uuid', adminA.access).expect(400);
    });

    it('login_events is append-only for the app role', async () => {
      const ctx = { organizationId: orgs[0].id, isSuperAdmin: false };
      await expect(tenantPrisma.forTenant(ctx, (tx) => tx.$executeRaw`UPDATE login_events SET result = 'success'`)).rejects.toThrow(/permission denied/);
      await expect(tenantPrisma.forTenant(ctx, (tx) => tx.$executeRaw`DELETE FROM login_events`)).rejects.toThrow(/permission denied/);
      await expect(tenantPrisma.forTenant(SUPER, (tx) => tx.$executeRaw`DELETE FROM login_events`)).rejects.toThrow(/permission denied/);
    });
  });
});
