import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'crypto';
import cookieParser from 'cookie-parser';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantPrismaService, invalidateTenantSecurityPolicy } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import type { hibp as HibpControl } from './fixtures/offline-hibp';
import { markSteppedUp } from './fixtures/step-up';

// P12 Part 1b end to end, against the real database (forced RLS, app role) and real Redis:
// password floor + breached check (YX-IAM-08), the company security policy and its admin API
// (Q8), session limits (YX-IAM-06), IP allow-lists (YX-IAM-09) and SSO-only break-glass (YX-IAM-04).
describe('Password floor and tenant security policy (P12 YX-IAM-04/06/08/09)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const hibp = (globalThis as unknown as { __hibp: typeof HibpControl }).__hibp;
  const jwt = new JwtService({});
  const email = { send: jest.fn().mockResolvedValue({ success: true }) };
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const runId = randomUUID().slice(0, 8);
  const emailOf = (name: string) => `${name}-${runId}@security-policy.test`;

  let planId: string;
  const orgs: { id: string; slug: string }[] = [];
  const users: Record<string, string> = {};
  const ADMIN_A = emailOf('admin-a');
  const ADMIN2_A = emailOf('admin2-a');
  const RECRUITER_A = emailOf('recruiter-a');
  const ADMIN_B = emailOf('admin-b');
  const API_KEY = `pk_live_${randomBytes(16).toString('hex')}`;

  let ipSeq = 0;
  const freshIp = () => `198.51.100.${++ipSeq}`;
  const OFFICE = '203.0.113.0/24';
  const officeIp = () => `203.0.113.${++ipSeq}`;
  const server = () => app.getHttpServer();
  const orgA = () => orgs[0];
  const orgB = () => orgs[1];

  const login = (slug: string, emailAddr: string, opts: { password?: string; ip?: string } = {}) =>
    request(server())
      .post('/api/v1/auth/staff/login')
      .set('X-Forwarded-For', opts.ip ?? freshIp())
      .send({ organizationSlug: slug, email: emailAddr, password: opts.password ?? PASSWORD });

  async function signIn(slug: string, emailAddr: string, ip = freshIp()) {
    const res = await login(slug, emailAddr, { ip }).expect(200);
    // Policy changes are step-up actions; that gate has its own suite (mfa.e2e-spec.ts).
    await markSteppedUp(tenantPrisma, res.body.accessToken);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    const refreshCookie = cookies.find((c) => c.startsWith('refresh_token='))!.split(';')[0];
    return { access: res.body.accessToken as string, refreshCookie, sid: (jwt.decode(res.body.accessToken) as { sid: string }).sid, ip };
  }

  const call = (method: 'get' | 'post' | 'patch' | 'delete', path: string, access: string, ip: string) =>
    request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${access}`).set('X-Forwarded-For', ip);

  // Writes a company's policy row directly (as the platform would) and drops the cached copy.
  async function setPolicy(organizationId: string, data: Partial<Prisma.TenantSecurityPolicyUncheckedCreateInput>) {
    await tenantPrisma.forTenant(SUPER, (tx) =>
      tx.tenantSecurityPolicy.upsert({ where: { organizationId }, create: { organizationId, ...data }, update: data }),
    );
    invalidateTenantSecurityPolicy(organizationId);
  }

  const auditActions = (organizationId: string, action: string) =>
    tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { organizationId, action }, orderBy: { createdAt: 'desc' } }));

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

    planId = (await prisma.plan.create({ data: { name: `sp-plan-${runId}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const label of ['a', 'b']) {
      const org = await prisma.organization.create({
        data: {
          name: `SP ${label}`,
          slug: `sp-${label}-${runId}`,
          planId,
          ...(label === 'a' ? { apiKeyHash: createHash('sha256').update(API_KEY).digest('hex') } : {}),
        },
      });
      orgs.push({ id: org.id, slug: org.slug });
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const seed: [number, string, string][] = [
      [0, ADMIN_A, 'org_admin'],
      [0, ADMIN2_A, 'org_admin'],
      [0, RECRUITER_A, 'recruiter'],
      [1, ADMIN_B, 'org_admin'],
    ];
    for (const [i, emailAddr, role] of seed) {
      const organizationId = orgs[i].id;
      const user = await tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, (tx) =>
        tx.user.create({ data: { organizationId, email: emailAddr, passwordHash, role } }),
      );
      users[emailAddr] = user.id;
    }
  });

  beforeEach(() => {
    email.send.mockClear();
    hibp.down = false;
  });

  afterEach(async () => {
    const ids = orgs.map((o) => o.id);
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      await tx.tenantSecurityPolicy.deleteMany({ where: { organizationId: { in: ids } } });
      await tx.identityProvider.deleteMany({ where: { organizationId: { in: ids } } });
    });
    ids.forEach(invalidateTenantSecurityPolicy);
  });

  afterAll(async () => {
    const ids = orgs.map((o) => o.id);
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        await tx.refreshToken.deleteMany({ where: { user: { organizationId: { in: ids } } } });
        await tx.user.deleteMany({ where: { organizationId: { in: ids } } });
      })
      .catch(() => undefined);
    await tenantPrisma.forTenant(SUPER, (tx) => tx.organization.deleteMany({ where: { id: { in: ids } } })).catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  describe('password floor (YX-IAM-08, Q8)', () => {
    it('admin-created users need >= 12 characters and a password not in a breach corpus', async () => {
      const admin = await signIn(orgA().slug, ADMIN_A);
      const create = (password: string) =>
        call('post', '/users', admin.access, admin.ip).send({ email: emailOf(`new-${randomUUID().slice(0, 6)}`), password, role: 'recruiter' });

      await create('elevenchars').expect(400);
      const breached = await create('password1234').expect(400);
      expect(JSON.stringify(breached.body)).toContain('known data breach');
      await create('a'.repeat(129)).expect(400);
      await create('tidal-oyster-lantern').expect(201);
    });

    it("the company's stricter minimum applies on change, and a breached new password is refused", async () => {
      await setPolicy(orgA().id, { passwordMinLength: 20 });
      const me = await signIn(orgA().slug, RECRUITER_A);
      const change = (newPassword: string) =>
        call('post', '/users/me/change-password', me.access, me.ip).set('Cookie', me.refreshCookie).send({ currentPassword: PASSWORD, newPassword });

      const short = await change('tidal-oyster-lamp').expect(400); // 17 chars: above the floor, below the company's 20
      expect(JSON.stringify(short.body)).toContain('at least 20');
      await change('qwertyuiop123').expect(400);
      // Unchanged: the old password still signs in.
      await login(orgA().slug, RECRUITER_A).expect(200);
    });

    it('a reset rejected by the floor leaves the link usable; a good password then consumes it', async () => {
      const raw = randomBytes(32).toString('hex');
      await prisma.passwordResetToken.create({
        data: { userId: users[ADMIN2_A], tokenHash: createHash('sha256').update(raw).digest('hex'), expiresAt: new Date(Date.now() + 600_000) },
      });
      const reset = (newPassword: string) => request(server()).post('/api/v1/auth/reset-password').set('X-Forwarded-For', freshIp()).send({ token: raw, newPassword });

      await reset('short').expect(400);
      await reset('Passw0rd!2024').expect(400); // breached
      await reset('granite-sparrow-violin').expect(200);
      await reset('another-fine-passphrase').expect(400); // single use
      await login(orgA().slug, ADMIN2_A, { password: 'granite-sparrow-violin' }).expect(200);
      // Restore the shared fixture password for the other tests.
      await tenantPrisma.forTenant(SUPER, async (tx) =>
        tx.user.update({ where: { id: users[ADMIN2_A] }, data: { passwordHash: await argon2.hash(PASSWORD) } }),
      );
    });

    it('breach service down: fail open but flag; the next sign-in re-checks, alerts, and makes a breached password be changed', async () => {
      const admin = await signIn(orgA().slug, ADMIN_A);
      const victim = emailOf(`flagged-${randomUUID().slice(0, 6)}`);
      const weakButLong = 'sunshine-sunshine-1';
      hibp.down = true;
      await call('post', '/users', admin.access, admin.ip).send({ email: victim, password: weakButLong, role: 'recruiter' }).expect(201);
      const flagged = await tenantPrisma.forTenant(SUPER, (tx) => tx.user.findFirstOrThrow({ where: { email: victim } }));
      expect(flagged.passwordRecheckPending).toBe(true);

      // Back up, and the password has since appeared in a breach.
      hibp.down = false;
      hibp.corpus.add(weakButLong);
      try {
        // Regression (ASVS V2.1.7): the breached password used to keep working after an email.
        // Now no session opens; a single-use reset token sends the browser to choose a new one.
        const forced = await login(orgA().slug, victim, { password: weakButLong }).expect(403);
        expect(forced.body).toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED', resetToken: expect.stringMatching(/^[0-9a-f]{64}$/) });
        expect(forced.body.accessToken).toBeUndefined();
        const after = await tenantPrisma.forTenant(SUPER, (tx) => tx.user.findUniqueOrThrow({ where: { id: flagged.id } }));
        expect(after).toMatchObject({ passwordRecheckPending: false, passwordChangeRequired: true });
        expect(await auditActions(orgA().id, 'password.breached_on_recheck')).toEqual([expect.objectContaining({ entityId: flagged.id })]);
        expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: victim, subject: 'Please change your YukthiX password' }));
        // Every later sign-in with it is refused the same way, until it is changed.
        await login(orgA().slug, victim, { password: weakButLong }).expect(403);
        await request(server()).post('/api/v1/auth/reset-password').send({ token: forced.body.resetToken, newPassword: 'a-much-better-passphrase-77' }).expect(200);
        await login(orgA().slug, victim, { password: 'a-much-better-passphrase-77' }).expect(200);
      } finally {
        hibp.corpus.delete(weakButLong);
      }
    });
  });

  describe('security policy admin API (Q8)', () => {
    it('reads the floor-default policy with the floor alongside', async () => {
      const admin = await signIn(orgA().slug, ADMIN_A);
      const res = await call('get', '/security/policy', admin.access, admin.ip).expect(200);
      expect(res.body.policy).toMatchObject({ mfaScope: 'sensitive_roles', passwordMinLength: 12, ssoOnly: false, ipAllowlistDesk: [] });
      expect(res.body.floor).toMatchObject({ passwordMinLength: 12, sessionIdleMinutes: { max: 480 }, sessionAbsoluteMinutes: { max: 720 } });
    });

    it('needs org:manage_settings: a recruiter is refused', async () => {
      const recruiter = await signIn(orgA().slug, RECRUITER_A);
      await call('get', '/security/policy', recruiter.access, recruiter.ip).expect(403);
      await call('patch', '/security/policy', recruiter.access, recruiter.ip).send({ mfaScope: 'all' }).expect(403);
    });

    it.each([
      [{ sessionIdleMinutes: 481 }],
      [{ sessionAbsoluteMinutes: 24 * 60 }],
      [{ passwordMinLength: 8 }],
      [{ mfaScope: 'none' }],
      [{ allowedFactors: ['otp'] }],
      [{ ipAllowlistApi: ['not-an-ip'] }],
      [{ ssoOnly: true }],
      [{ organizationId: '00000000-0000-4000-8000-000000000000' }],
    ])('refuses anything laxer than the floor or malformed: %j', async (body) => {
      const admin = await signIn(orgA().slug, ADMIN_A);
      await call('patch', '/security/policy', admin.access, admin.ip).send(body).expect(400);
      const row = await tenantPrisma.forTenant(SUPER, (tx) => tx.tenantSecurityPolicy.findUnique({ where: { organizationId: orgA().id } }));
      expect(row).toBeNull();
    });

    it('the database itself refuses a laxer value, whatever the code path', async () => {
      await expect(setPolicy(orgA().id, { sessionAbsoluteMinutes: 721 })).rejects.toThrow(/tsp_session_absolute_check/);
      await expect(setPolicy(orgA().id, { passwordMinLength: 11 })).rejects.toThrow(/tsp_password_min_length_check/);
      await expect(setPolicy(orgA().id, { allowedFactors: ['otp'] })).rejects.toThrow(/tsp_allowed_factors_check/);
      await expect(setPolicy(orgA().id, { ssoOnly: true, breakGlassUserIds: [users[ADMIN_A]] })).rejects.toThrow(/tsp_break_glass_check/);
    });

    it('saves a stricter policy, audits every change, and stays inside the tenant', async () => {
      const admin = await signIn(orgA().slug, ADMIN_A);
      const res = await call('patch', '/security/policy', admin.access, admin.ip)
        .send({ mfaScope: 'all', passwordMinLength: 16, sessionIdleMinutes: 15, maxConcurrentSessions: 3 })
        .expect(200);
      expect(res.body.policy).toMatchObject({ mfaScope: 'all', passwordMinLength: 16, sessionIdleMinutes: 15, maxConcurrentSessions: 3 });

      const [entry] = await auditActions(orgA().id, 'security_policy.updated');
      expect(entry).toMatchObject({ actorUserId: users[ADMIN_A], entityId: orgA().id });
      expect(JSON.parse(entry.metadataJson!)).toMatchObject({ changes: { mfaScope: { from: 'sensitive_roles', to: 'all' }, passwordMinLength: { from: 12, to: 16 } } });

      // Company B still has the defaults, and cannot see A's row even by asking the database.
      const b = await signIn(orgB().slug, ADMIN_B);
      expect((await call('get', '/security/policy', b.access, b.ip).expect(200)).body.policy.mfaScope).toBe('sensitive_roles');
      const seenByB = await tenantPrisma.forTenant({ organizationId: orgB().id, isSuperAdmin: false }, (tx) =>
        tx.tenantSecurityPolicy.findUnique({ where: { organizationId: orgA().id } }),
      );
      expect(seenByB).toBeNull();
    });

    it('refuses to save desk or admin lists that would lock out the admin saving them', async () => {
      const admin = await signIn(orgA().slug, ADMIN_A, freshIp());
      const res = await call('patch', '/security/policy', admin.access, admin.ip).send({ ipAllowlistDesk: [OFFICE] }).expect(400);
      expect(JSON.stringify(res.body)).toContain('lock you out');
    });
  });

  describe('session limits (YX-IAM-06)', () => {
    it("new sessions follow the company's limits, and tightening them shortens sessions already open", async () => {
      const before = await signIn(orgA().slug, RECRUITER_A);
      await setPolicy(orgA().id, { sessionIdleMinutes: 10, sessionAbsoluteMinutes: 60 });

      const fresh = await signIn(orgA().slug, RECRUITER_A);
      const row = await tenantPrisma.forTenant(SUPER, (tx) => tx.session.findUniqueOrThrow({ where: { id: fresh.sid } }));
      expect(row.idleTimeoutSeconds).toBe(600);
      expect(row.absoluteExpiresAt.getTime() - row.createdAt.getTime()).toBeLessThanOrEqual(3600 * 1000 + 1000);

      // Through the admin API this time, so the open-session clamp runs.
      await tenantPrisma.forTenant(SUPER, (tx) => tx.tenantSecurityPolicy.delete({ where: { organizationId: orgA().id } }));
      invalidateTenantSecurityPolicy(orgA().id);
      const admin = await signIn(orgA().slug, ADMIN_A);
      await call('patch', '/security/policy', admin.access, admin.ip).send({ sessionIdleMinutes: 5, sessionAbsoluteMinutes: 30 }).expect(200);
      const clamped = await tenantPrisma.forTenant(SUPER, (tx) => tx.session.findUniqueOrThrow({ where: { id: before.sid } }));
      expect(clamped.idleTimeoutSeconds).toBe(300);
      expect(clamped.absoluteExpiresAt.getTime() - clamped.createdAt.getTime()).toBeLessThanOrEqual(30 * 60 * 1000 + 1000);
    });

    it('a concurrent-session cap signs out the least recently used session at the next sign-in', async () => {
      await setPolicy(orgA().id, { maxConcurrentSessions: 1 });
      const first = await signIn(orgA().slug, ADMIN2_A);
      await call('get', '/auth/sessions', first.access, first.ip).expect(200);
      const second = await signIn(orgA().slug, ADMIN2_A);

      await call('get', '/auth/sessions', first.access, first.ip).expect(401);
      await request(server()).post('/api/v1/auth/refresh').set('Cookie', first.refreshCookie).send({}).expect(401);
      await call('get', '/auth/sessions', second.access, second.ip).expect(200);
      const revoked = await tenantPrisma.forTenant(SUPER, (tx) => tx.session.findUniqueOrThrow({ where: { id: first.sid } }));
      expect(revoked.revokedReason).toBe('concurrent_limit');
      expect(await auditActions(orgA().id, 'session.revoked_concurrent_limit')).not.toHaveLength(0);
    });
  });

  describe('IP allow-lists (YX-IAM-09)', () => {
    // Outside the list the answer is the wrong-password one, whatever the password: an outsider
    // learns neither that the organisation restricts networks nor whether a password is right.
    it('desk: sign-in from outside is refused like a wrong password, right password or not; inside works', async () => {
      await setPolicy(orgA().id, { ipAllowlistDesk: [OFFICE] });
      const wrong = await login(orgA().slug, RECRUITER_A, { password: 'definitely-wrong', ip: freshIp() }).expect(401);
      const right = await login(orgA().slug, RECRUITER_A, { ip: freshIp() }).expect(401);
      expect(right.body).toEqual(wrong.body);
      expect(right.body.message).toBe('Invalid credentials');
      await login(orgA().slug, RECRUITER_A, { ip: officeIp() }).expect(200);

      const events = await tenantPrisma.forTenant(SUPER, (tx) =>
        tx.loginEvent.findMany({ where: { organizationId: orgA().id, reason: 'ip_not_allowed' } }),
      );
      expect(events.length).toBeGreaterThan(0);
    });

    it('desk: a session carried off the allowed network is refused on every request and on refresh', async () => {
      const s = await signIn(orgA().slug, RECRUITER_A, officeIp());
      await setPolicy(orgA().id, { ipAllowlistDesk: [OFFICE] });

      await call('get', '/auth/sessions', s.access, officeIp()).expect(200);
      await call('get', '/auth/sessions', s.access, freshIp()).expect(403);
      await request(server()).post('/api/v1/auth/refresh').set('Cookie', s.refreshCookie).set('X-Forwarded-For', freshIp()).send({}).expect(403);
      // The refusal did not burn the refresh token: from the office it still rotates.
      await request(server()).post('/api/v1/auth/refresh').set('Cookie', s.refreshCookie).set('X-Forwarded-For', officeIp()).send({}).expect(200);
    });

    it('desk: does not leak into another company', async () => {
      await setPolicy(orgA().id, { ipAllowlistDesk: [OFFICE] });
      await signIn(orgB().slug, ADMIN_B, freshIp());
    });

    it('admin: admin-console endpoints need the admin list; everyday ones do not', async () => {
      const admin = await signIn(orgA().slug, ADMIN_A, freshIp());
      await setPolicy(orgA().id, { ipAllowlistAdmin: ['192.0.2.0/24'] });

      await call('get', '/security/sessions', admin.access, admin.ip).expect(403); // org:manage_users
      await call('get', '/security/policy', admin.access, admin.ip).expect(403); // org:manage_settings
      await call('get', '/auth/sessions', admin.access, admin.ip).expect(200); // own sessions: desk only
      // The audit trail / login activity is admin-console too (it used to be reachable from anywhere).
      await call('get', '/security/login-events', admin.access, admin.ip).expect(403); // audit:view
      await call('get', '/security/login-events', admin.access, '192.0.2.7').expect(200);
      await call('get', '/security/policy', admin.access, '192.0.2.7').expect(200);
    });

    it('api: a valid key works only from the listed addresses', async () => {
      const publicExams = (ip: string, key = API_KEY) =>
        request(server()).get('/api/v1/public/exams').set('Authorization', `Bearer ${key}`).set('X-Forwarded-For', ip);
      await publicExams(freshIp()).expect(200);

      await setPolicy(orgA().id, { ipAllowlistApi: ['192.0.2.0/24'] });
      await publicExams(freshIp()).expect(403);
      await publicExams('192.0.2.9').expect(200);
      // A wrong key is still the same 401, never the network refusal.
      await publicExams(freshIp(), 'pk_live_wrong').expect(401);
    });
  });

  describe('SSO-only with break-glass accounts (YX-IAM-04)', () => {
    beforeEach(async () => {
      // An active identity provider (P12 Part 1e) is what "SSO is set up" means.
      await tenantPrisma.forTenant(SUPER, (tx) =>
        tx.identityProvider.create({
          data: {
            organizationId: orgA().id,
            type: 'oidc_google',
            name: 'Google',
            status: 'active',
            oidcIssuer: 'https://accounts.google.com',
            oidcClientId: 'client',
            oidcClientSecretEncrypted: 'not-used-here',
          },
        }),
      );
    });

    it('turning it on needs two active admins named as break-glass', async () => {
      const admin = await signIn(orgA().slug, ADMIN_A);
      await call('patch', '/security/policy', admin.access, admin.ip).send({ ssoOnly: true, breakGlassUserIds: [users[ADMIN_A]] }).expect(400);
      await call('patch', '/security/policy', admin.access, admin.ip)
        .send({ ssoOnly: true, breakGlassUserIds: [users[ADMIN_A], users[RECRUITER_A]] })
        .expect(400); // a recruiter is not an admin
      await call('patch', '/security/policy', admin.access, admin.ip)
        .send({ ssoOnly: true, breakGlassUserIds: [users[ADMIN_A], users[ADMIN_B]] })
        .expect(400); // another company's admin
      await call('patch', '/security/policy', admin.access, admin.ip)
        .send({ ssoOnly: true, breakGlassUserIds: [users[ADMIN_A], users[ADMIN2_A]] })
        .expect(200);
    });

    it('password sign-in is off for everyone else (same response as a wrong password); break-glass works and alerts all admins', async () => {
      await setPolicy(orgA().id, { ssoOnly: true, breakGlassUserIds: [users[ADMIN_A], users[ADMIN2_A]] });

      const refused = await login(orgA().slug, RECRUITER_A).expect(401);
      const wrong = await login(orgA().slug, RECRUITER_A, { password: 'not-the-password' }).expect(401);
      expect(refused.body).toEqual(wrong.body);

      // Break-glass accounts must have MFA (YX-IAM-04): without a factor, the wrong-password response.
      expect((await login(orgA().slug, ADMIN_A).expect(401)).body).toEqual(wrong.body);

      // With one (an authenticator app plus a recovery code, planted directly), the second factor completes it.
      const recoveryCode = 'abcd-efgh-ijkm-npqr';
      const factor = await tenantPrisma.forTenant(SUPER, async (tx) => {
        await tx.recoveryCode.create({ data: { organizationId: orgA().id, userId: users[ADMIN_A], codeHash: createHash('sha256').update(recoveryCode.replace(/-/g, '')).digest('hex') } });
        return tx.authenticator.create({ data: { organizationId: orgA().id, userId: users[ADMIN_A], type: 'totp', label: 'test', secretEncrypted: 'unused.in.this.test' } });
      });
      try {
        const ip = freshIp();
        const first = await login(orgA().slug, ADMIN_A, { ip }).expect(200);
        expect(first.body.mfaRequired).toBe(true);
        const device = ((first.headers['set-cookie'] as unknown as string[]) ?? []).find((c) => c.startsWith('yx_device='))!.split(';')[0];
        await request(server()).post('/api/v1/auth/mfa/verify').set('Cookie', device).set('X-Forwarded-For', ip)
          .send({ mfaToken: first.body.mfaToken, factor: 'recovery_code', code: recoveryCode }).expect(200);
      } finally {
        await tenantPrisma.forTenant(SUPER, async (tx) => {
          await tx.authenticator.update({ where: { id: factor.id }, data: { revokedAt: new Date() } });
          await tx.recoveryCode.deleteMany({ where: { userId: users[ADMIN_A] } });
        });
      }
      await new Promise((r) => setTimeout(r, 200));
      const alerted = email.send.mock.calls.map((c) => c[0]).filter((m) => m.subject === 'Break-glass sign-in to your YukthiX organisation');
      expect(alerted.map((m) => m.to).sort()).toEqual([ADMIN_A, ADMIN2_A].sort());
      expect(await auditActions(orgA().id, 'login.break_glass')).not.toHaveLength(0);
      const event = await tenantPrisma.forTenant(SUPER, (tx) =>
        tx.loginEvent.findFirst({ where: { userId: users[ADMIN_A], reason: 'break_glass' } }),
      );
      expect(event).toMatchObject({ result: 'success', method: 'password' });
    });
  });
});
