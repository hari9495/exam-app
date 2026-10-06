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
import { PrismaService, TenantPrismaService, invalidateTenantSecurityPolicy } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { SoftAuthenticator } from './fixtures/soft-authenticator';

// P12 Part 1c end to end, against the real database (forced RLS, app role) and real Redis:
// MFA enrolment and sign-in (YX-IAM-01/03), the sensitive-role floor with its 14-day grace,
// step-up (YX-IAM-02), recovery codes and the two-admin MFA reset (YX-IAM-11). TOTP codes come
// from otplib and passkey ceremonies from a real software authenticator: nothing is mocked.
describe('MFA, step-up and recovery (P12 YX-IAM-01/02/03/11)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let redis: Redis;
  const jwt = new JwtService({});
  const email = { send: jest.fn().mockResolvedValue({ success: true }) };
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const runId = randomUUID().slice(0, 8);
  const emailOf = (name: string) => `${name}-${runId}@mfa.test`;
  const OTP = { crypto: new NodeCryptoPlugin(), base32: createBase32Plugin({ encode: base32.encode, decode: base32.decode }) };

  // Shared across the describe blocks below (they run in order).
  let secret: string; // TOTP_USER's authenticator app
  let recoveryCodes: string[];
  let adminDevice: SoftAuthenticator; // ADMIN's passkey

  let planId: string;
  const orgs: { id: string; slug: string }[] = [];
  const users: Record<string, string> = {};
  const A = () => orgs[0];
  const B = () => orgs[1];
  const ADMIN = emailOf('admin');
  const ADMIN2 = emailOf('admin2');
  const TOTP_USER = emailOf('totp');
  const RECRUITER = emailOf('recruiter');
  const PANEL = emailOf('panel');
  const LATE = emailOf('late'); // org admin past the enrolment grace
  const ADMIN_B = emailOf('admin-b');

  // Every request its own IPv6 /64 (the lockout's per-IP unit), so the deliberate failures below
  // never count against other suites' addresses in the shared Redis.
  let ipSeq = 0;
  const freshIp = () => `2001:db8:${runId.slice(0, 4)}:${(++ipSeq).toString(16)}::1`;
  const server = () => app.getHttpServer();

  // TOTP: each time step is accepted once per authenticator, so hand out a new one each time
  // (current step, then the next; wait for the clock when both are used).
  const lastStep = new Map<string, number>();
  async function totp(secret: string): Promise<string> {
    for (;;) {
      const now = Math.floor(Date.now() / 30_000);
      const step = Math.max(now, (lastStep.get(secret) ?? now - 1) + 1);
      if (step <= now + 1) {
        lastStep.set(secret, step);
        return totpAt({ ...OTP, secret, epoch: step * 30 });
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  const deviceOf = (res: request.Response) =>
    ((res.headers['set-cookie'] as unknown as string[] | undefined) ?? []).find((c) => c.startsWith('yx_device='))?.split(';')[0];

  function login(slug: string, who: string, opts: { device?: string; ip?: string } = {}) {
    const req = request(server()).post('/api/v1/auth/staff/login').set('X-Forwarded-For', opts.ip ?? freshIp());
    if (opts.device) req.set('Cookie', opts.device);
    return req.send({ organizationSlug: slug, email: who, password: PASSWORD });
  }

  interface Signed {
    access: string;
    sid: string;
    ip: string;
    device: string;
    refreshCookie?: string;
  }
  const signed = (res: request.Response, ip: string, device: string): Signed => ({
    access: res.body.accessToken,
    sid: (jwt.decode(res.body.accessToken) as { sid: string }).sid,
    ip,
    device,
    refreshCookie: ((res.headers['set-cookie'] as unknown as string[]) ?? []).find((c) => c.startsWith('refresh_token='))?.split(';')[0],
  });

  // Password only (no factor enrolled yet).
  async function signIn(slug: string, who: string): Promise<Signed & { body: Record<string, unknown> }> {
    const ip = freshIp();
    const res = await login(slug, who, { ip }).expect(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    return { ...signed(res, ip, deviceOf(res)!), body: res.body };
  }

  // Password, then the second factor.
  async function signInWith(slug: string, who: string, proof: (mfaToken: string, device: string, ip: string) => Promise<Record<string, unknown>>): Promise<Signed> {
    const ip = freshIp();
    const first = await login(slug, who, { ip }).expect(200);
    expect(first.body).toMatchObject({ mfaRequired: true, mfaToken: expect.any(String) });
    const device = deviceOf(first)!;
    const res = await request(server())
      .post('/api/v1/auth/mfa/verify')
      .set('Cookie', device)
      .set('X-Forwarded-For', ip)
      .send({ mfaToken: first.body.mfaToken, ...(await proof(first.body.mfaToken, device, ip)) })
      .expect(200);
    return signed(res, ip, device);
  }

  const call = (method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string, s: { access: string; ip: string }) =>
    request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${s.access}`).set('X-Forwarded-For', s.ip);

  async function enrolTotp(s: Signed): Promise<{ secret: string; recoveryCodes: string[] }> {
    const setup = await call('post', '/auth/mfa/totp/setup', s).expect(200);
    const res = await call('post', '/auth/mfa/totp/confirm', s).send({ code: await totp(setup.body.secret) }).expect(200);
    return { secret: setup.body.secret, recoveryCodes: res.body.recoveryCodes };
  }

  async function enrolPasskey(s: Signed, device = new SoftAuthenticator()): Promise<{ device: SoftAuthenticator; recoveryCodes?: string[] }> {
    const options = await call('post', '/auth/mfa/passkeys/registration-options', s).expect(200);
    const res = await call('post', '/auth/mfa/passkeys', s).send({ credential: device.register(options.body), label: 'Laptop' }).expect(200);
    return { device, recoveryCodes: res.body.recoveryCodes };
  }

  const passkeyProof = (device: SoftAuthenticator) => async (mfaToken: string, cookie: string, ip: string) => {
    const options = await request(server()).post('/api/v1/auth/mfa/passkey-options').set('Cookie', cookie).set('X-Forwarded-For', ip).send({ mfaToken }).expect(200);
    return { factor: 'passkey', credential: device.assert(options.body) };
  };

  async function stepUpWithPasskey(s: Signed, device: SoftAuthenticator, status = 200) {
    const options = await call('post', '/auth/mfa/step-up/passkey-options', s).expect(200);
    return call('post', '/auth/mfa/step-up', s).send({ factor: 'passkey', credential: device.assert(options.body) }).expect(status);
  }

  const session = (id: string) => tenantPrisma.forTenant(SUPER, (tx) => tx.session.findUniqueOrThrow({ where: { id } }));
  const ageStepUp = (id: string, minutes: number) =>
    tenantPrisma.forTenant(SUPER, (tx) => tx.session.update({ where: { id }, data: { mfaVerifiedAt: new Date(Date.now() - minutes * 60_000) } }));
  const setDue = (who: string, due: Date) => tenantPrisma.forTenant(SUPER, (tx) => tx.user.update({ where: { id: users[who] }, data: { mfaEnrolmentDueAt: due } }));
  const auditActions = (organizationId: string, action: string) =>
    tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { organizationId, action }, orderBy: { createdAt: 'desc' } }));
  const events = (who: string) =>
    tenantPrisma.forTenant(SUPER, (tx) => tx.loginEvent.findMany({ where: { userId: users[who] }, orderBy: { createdAt: 'desc' } }));
  const codeOf = (res: request.Response) => (res.body as { code?: string }).code;
  const mfaKey = (who: string) => createHash('sha256').update(`mfa\u0000${users[who]}`).digest('hex');

  beforeAll(async () => {
    process.env.WEBAUTHN_RP_ID = 'localhost';
    process.env.WEBAUTHN_ORIGINS = 'http://localhost:3000';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue(email).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.getHttpAdapter().getInstance().set('trust proxy', true);
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');

    planId = (await prisma.plan.create({ data: { name: `mfa-plan-${runId}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const label of ['a', 'b']) {
      const org = await prisma.organization.create({ data: { name: `MFA ${label}`, slug: `mfa-${label}-${runId}`, planId } });
      orgs.push({ id: org.id, slug: org.slug });
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const seed: [number, string, string][] = [
      [0, ADMIN, 'org_admin'],
      [0, ADMIN2, 'org_admin'],
      [0, TOTP_USER, 'org_admin'],
      [0, RECRUITER, 'recruiter'],
      [0, PANEL, 'panel'],
      [0, LATE, 'org_admin'],
      [1, ADMIN_B, 'org_admin'],
    ];
    for (const [i, who, role] of seed) {
      const organizationId = orgs[i].id;
      const row = await tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, (tx) =>
        tx.user.create({ data: { organizationId, email: who, passwordHash, role } }),
      );
      users[who] = row.id;
    }
  });

  beforeEach(() => email.send.mockClear());

  afterAll(async () => {
    const ids = orgs.map((o) => o.id);
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        await tx.refreshToken.deleteMany({ where: { user: { organizationId: { in: ids } } } });
        await tx.user.deleteMany({ where: { organizationId: { in: ids } } }); // sessions, factors, codes, resets cascade
        await tx.tenantSecurityPolicy.deleteMany({ where: { organizationId: { in: ids } } });
      })
      .catch(() => undefined);
    await tenantPrisma.forTenant(SUPER, (tx) => tx.organization.deleteMany({ where: { id: { in: ids } } })).catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    redis.disconnect();
    await app.close();
  });

  describe('existing accounts keep signing in with a 14-day enrolment grace (P12 §8)', () => {
    it('a sensitive role without a factor gets a session and is told when enrolment becomes mandatory', async () => {
      const s = await signIn(A().slug, ADMIN2);
      expect(s.body.mfa).toEqual({ required: true, enrolmentDueAt: expect.any(String) });
      const due = new Date((s.body.mfa as { enrolmentDueAt: string }).enrolmentDueAt).getTime();
      expect(due).toBeGreaterThan(Date.now() + 13 * 86_400_000);
      expect(due).toBeLessThanOrEqual(Date.now() + 14 * 86_400_000);
      expect((await session(s.sid)).assuranceLevel).toBe('aal1');
      // ...and can still use admin permissions inside the grace.
      await call('get', '/security/sessions', s).expect(200);
    });

    it('a role MFA is not required for gets no prompt', async () => {
      const s = await signIn(A().slug, PANEL);
      expect(s.body.mfa).toBeUndefined();
    });
  });

  describe('TOTP (otplib) and recovery codes', () => {
    it('enrolment: secret encrypted at rest, 10 recovery codes shown once and stored hashed, session lifted to AAL2', async () => {
      const s = await signIn(A().slug, TOTP_USER);
      const wrong = await call('post', '/auth/mfa/totp/setup', s).expect(200);
      await call('post', '/auth/mfa/totp/confirm', s).send({ code: '000000' === (await totp(wrong.body.secret)) ? '111111' : '000000' }).expect(400);
      ({ secret, recoveryCodes } = await enrolTotp(s));

      expect(recoveryCodes).toHaveLength(10);
      const [factor] = await tenantPrisma.forTenant(SUPER, (tx) => tx.authenticator.findMany({ where: { userId: users[TOTP_USER] } }));
      expect(factor).toMatchObject({ type: 'totp', organizationId: A().id, revokedAt: null });
      expect(factor.secretEncrypted).not.toContain(secret);
      const codes = await tenantPrisma.forTenant(SUPER, (tx) => tx.recoveryCode.findMany({ where: { userId: users[TOTP_USER] } }));
      expect(codes).toHaveLength(10);
      expect(JSON.stringify(codes)).not.toContain(recoveryCodes[0]);
      expect(await session(s.sid)).toMatchObject({ assuranceLevel: 'aal2', mfaMethod: 'totp', mfaVerifiedAt: expect.any(Date) });
      expect(await auditActions(A().id, 'mfa.enrolled')).toEqual([expect.objectContaining({ actorUserId: users[TOTP_USER] })]);
      expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: TOTP_USER, subject: 'Two-step verification added to your YukthiX account' }));

      const status = await call('get', '/auth/mfa', s).expect(200);
      expect(status.body).toMatchObject({ required: true, recoveryCodesRemaining: 10, assuranceLevel: 'aal2', factors: [expect.objectContaining({ type: 'totp' })] });
      expect(JSON.stringify(status.body)).not.toContain('secret');
    });

    it('sign-in now needs the code: the password alone opens no session and sets no refresh cookie', async () => {
      const before = await tenantPrisma.forTenant(SUPER, (tx) => tx.session.count({ where: { userId: users[TOTP_USER] } }));
      const res = await login(A().slug, TOTP_USER).expect(200);
      expect(res.body).toEqual({ mfaRequired: true, mfaToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/), factors: ['totp', 'recovery_code'], expiresInSeconds: 300 });
      expect(res.body.accessToken).toBeUndefined();
      expect(((res.headers['set-cookie'] as unknown as string[]) ?? []).some((c) => c.startsWith('refresh_token='))).toBe(false);
      expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.session.count({ where: { userId: users[TOTP_USER] } }))).toBe(before);
    });

    it('the right code opens an AAL2 session; the code, the token and another device are all refused afterwards', async () => {
      const ip = freshIp();
      const first = await login(A().slug, TOTP_USER, { ip }).expect(200);
      const device = deviceOf(first)!;
      const verify = (body: object, cookie = device) =>
        request(server()).post('/api/v1/auth/mfa/verify').set('Cookie', cookie).set('X-Forwarded-For', ip).send({ mfaToken: first.body.mfaToken, ...body });

      // Wrong code: refused and recorded.
      await verify({ factor: 'totp', code: '000000' === (await totp(secret)) ? '111111' : '000000' }).expect(401);
      // Same token from another browser: refused even with a good code.
      const code = await totp(secret);
      await verify({ factor: 'totp', code }, `yx_device=${'z'.repeat(43)}`).expect(401);

      const ok = await verify({ factor: 'totp', code }).expect(200);
      const s = signed(ok, ip, device);
      expect(s.refreshCookie).toBeDefined();
      expect(await session(s.sid)).toMatchObject({ method: 'password', assuranceLevel: 'aal2', mfaMethod: 'totp' });

      // The pending token is single-use, and so is the code's time step.
      await verify({ factor: 'totp', code }).expect(401);
      const again = await login(A().slug, TOTP_USER, { ip }).expect(200);
      await request(server()).post('/api/v1/auth/mfa/verify').set('Cookie', deviceOf(again) ?? device).set('X-Forwarded-For', ip)
        .send({ mfaToken: again.body.mfaToken, factor: 'totp', code }).expect(401);

      const history = await events(TOTP_USER);
      expect(history).toEqual(expect.arrayContaining([
        expect.objectContaining({ result: 'mfa_failed', method: 'totp', reason: 'mfa_invalid' }),
        expect.objectContaining({ result: 'success', method: 'password', reason: 'mfa_totp', sessionId: s.sid }),
      ]));
    });

    it('a tampered or forged pending token is refused and logged', async () => {
      const res = await request(server()).post('/api/v1/auth/mfa/verify').set('X-Forwarded-For', freshIp())
        .send({ mfaToken: 'A'.repeat(43), factor: 'totp', code: '123456' }).expect(401);
      expect(res.body.accessToken).toBeUndefined();
      await request(server()).post('/api/v1/auth/mfa/verify').send({ mfaToken: 'short', factor: 'totp', code: '123456' }).expect(400);
    });

    it('a recovery code signs in exactly once, and its use is audited and emailed', async () => {
      const code = recoveryCodes[0];
      const s = await signInWith(A().slug, TOTP_USER, async () => ({ factor: 'recovery_code', code: code.toUpperCase() }));
      expect(await session(s.sid)).toMatchObject({ assuranceLevel: 'aal2', mfaMethod: 'recovery_code' });
      expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: TOTP_USER, subject: 'A recovery code was used on your YukthiX account' }));
      expect(await auditActions(A().id, 'mfa.recovery_code_used')).toHaveLength(1);

      const ip = freshIp();
      const first = await login(A().slug, TOTP_USER, { ip }).expect(200);
      await request(server()).post('/api/v1/auth/mfa/verify').set('Cookie', deviceOf(first)!).set('X-Forwarded-For', ip)
        .send({ mfaToken: first.body.mfaToken, factor: 'recovery_code', code }).expect(401);
    });

    it('brute force: repeated wrong codes lock the second step (even the right code), and the user is told', async () => {
      const ip = freshIp();
      const first = await login(A().slug, TOTP_USER, { ip }).expect(200);
      const device = deviceOf(first)!;
      const verify = (code: string) =>
        request(server()).post('/api/v1/auth/mfa/verify').set('Cookie', device).set('X-Forwarded-For', ip).send({ mfaToken: first.body.mfaToken, factor: 'totp', code });
      try {
        await redis.del(`auth:lp:acct:fail:${mfaKey(TOTP_USER)}`, `auth:lp:acct:block:${mfaKey(TOTP_USER)}`);
        for (let i = 1; i <= 10; i++) {
          await redis.del(`auth:lp:acct:block:${mfaKey(TOTP_USER)}`); // skip the progressive delays, keep the count
          await verify(String(100000 + i)).expect(401);
        }
        const blocked = await verify(await totp(secret)).expect(429);
        expect(blocked.body.retryAfterSeconds).toBeGreaterThan(800);
        expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: TOTP_USER, subject: 'Sign-in to your YukthiX account was temporarily locked' }));
        expect(await events(TOTP_USER)).toEqual(expect.arrayContaining([expect.objectContaining({ result: 'locked' })]));
      } finally {
        await redis.del(`auth:lp:acct:fail:${mfaKey(TOTP_USER)}`, `auth:lp:acct:block:${mfaKey(TOTP_USER)}`);
      }
    });
  });

  describe('passkeys (@simplewebauthn/server)', () => {
    it('enrols a passkey and signs in with it; a tampered assertion or a reused challenge is refused', async () => {
      const s = await signIn(A().slug, ADMIN);
      ({ device: adminDevice } = await enrolPasskey(s));
      const [row] = await tenantPrisma.forTenant(SUPER, (tx) => tx.authenticator.findMany({ where: { userId: users[ADMIN] } }));
      expect(row).toMatchObject({ type: 'passkey', credentialId: adminDevice.id, secretEncrypted: null });

      const ok = await signInWith(A().slug, ADMIN, passkeyProof(adminDevice));
      expect(await session(ok.sid)).toMatchObject({ assuranceLevel: 'aal2', mfaMethod: 'passkey' });

      const ip = freshIp();
      const first = await login(A().slug, ADMIN, { ip }).expect(200);
      const device = deviceOf(first)!;
      const opts = await request(server()).post('/api/v1/auth/mfa/passkey-options').set('Cookie', device).set('X-Forwarded-For', ip).send({ mfaToken: first.body.mfaToken }).expect(200);
      const verify = (credential: object) =>
        request(server()).post('/api/v1/auth/mfa/verify').set('Cookie', device).set('X-Forwarded-For', ip).send({ mfaToken: first.body.mfaToken, factor: 'passkey', credential });
      await verify(adminDevice.assert(opts.body, { tamper: true })).expect(401);
      await verify(adminDevice.assert(opts.body)).expect(401); // the challenge died with the failed attempt
      await verify(new SoftAuthenticator().assert(opts.body)).expect(401);
      // Options for a pending sign-in come only to the device that started it.
      await request(server()).post('/api/v1/auth/mfa/passkey-options').set('X-Forwarded-For', ip).send({ mfaToken: first.body.mfaToken }).expect(401);
      // Three failures started the progressive delay for this account (proven in the TOTP block).
      expect(await redis.get(`auth:lp:acct:fail:${mfaKey(ADMIN)}`)).toBe('3');
      await redis.del(`auth:lp:acct:fail:${mfaKey(ADMIN)}`, `auth:lp:acct:block:${mfaKey(ADMIN)}`);
    });

    it('a second factor needs a fresh step-up, so a stolen session cannot plant its own', async () => {
      const s = await signInWith(A().slug, ADMIN, passkeyProof(adminDevice));
      await ageStepUp(s.sid, 16);
      expect(codeOf(await call('post', '/auth/mfa/totp/setup', s).expect(403))).toBe('STEP_UP_REQUIRED');
      expect(codeOf(await call('post', '/auth/mfa/passkeys/registration-options', s).expect(403))).toBe('STEP_UP_REQUIRED');
      await stepUpWithPasskey(s, adminDevice);
      const { recoveryCodes } = await enrolPasskey(s);
      expect(recoveryCodes).toBeUndefined();
    });

    describe('step-up (YX-IAM-02)', () => {
      it('security policy, API keys, roles and permission profiles need AAL2 within 15 minutes; each use is audited', async () => {
        const s = await signInWith(A().slug, ADMIN, passkeyProof(adminDevice));
        // Freshly verified at sign-in: allowed, and the step-up lands on the audit log.
        await call('patch', '/security/policy', s).send({ passwordMinLength: 14 }).expect(200);
        const [used] = await auditActions(A().id, 'step_up.used');
        expect(used).toMatchObject({ actorUserId: users[ADMIN] });
        expect(JSON.parse(used.metadataJson!)).toMatchObject({ factor: 'passkey', route: 'PATCH /api/v1/security/policy' });

        await ageStepUp(s.sid, 16);
        for (const [method, path, body] of [
          ['patch', '/security/policy', { passwordMinLength: 15 }],
          ['post', '/organizations/integrations/api-key', {}],
          ['put', '/organizations/role-permissions/recruiter', { permissions: ['org:view'] }],
          ['post', '/organizations/permission-profiles', { name: 'x', permissions: ['org:view'] }],
          ['patch', `/users/${users[RECRUITER]}`, { role: 'panel' }],
          ['post', '/users', { email: emailOf('new-admin'), password: PASSWORD, role: 'org_admin' }],
        ] as const) {
          const res = await call(method, path, s).send(body).expect(403);
          expect(codeOf(res)).toBe('STEP_UP_REQUIRED');
        }
        // Editing a name is not a role change: no step-up.
        await call('patch', `/users/${users[RECRUITER]}`, s).send({ name: 'Rita Recruiter' }).expect(200);

        // A failed step-up is audited and counted; a good one opens the window again.
        await call('post', '/auth/mfa/step-up', s).send({ factor: 'totp', code: '123456' }).expect(401);
        expect(await auditActions(A().id, 'mfa.step_up_failed')).toHaveLength(1);
        const ok = await stepUpWithPasskey(s, adminDevice);
        expect(new Date(ok.body.stepUpValidUntil).getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
        expect((await auditActions(A().id, 'mfa.step_up')).filter((a) => a.entityId === s.sid)).toHaveLength(1);
        await call('patch', '/security/policy', s).send({ passwordMinLength: 15 }).expect(200);
        await call('post', '/organizations/integrations/api-key', s).expect(201);
      });

      it('a step-up passkey assertion is bound to its own session and challenge', async () => {
        const s = await signInWith(A().slug, ADMIN, passkeyProof(adminDevice));
        const other = await signInWith(A().slug, ADMIN, passkeyProof(adminDevice));
        await ageStepUp(s.sid, 16);
        const options = await call('post', '/auth/mfa/step-up/passkey-options', other).expect(200);
        // An assertion over the other session's challenge does not step this session up.
        await call('post', '/auth/mfa/step-up', s).send({ factor: 'passkey', credential: adminDevice.assert(options.body) }).expect(401);
        expect((await session(s.sid)).mfaVerifiedAt!.getTime()).toBeLessThan(Date.now() - 15 * 60_000);
      });

      it('an account with no factor cannot step up, so it cannot take step-up actions even inside the grace', async () => {
        const s = await signIn(A().slug, ADMIN2);
        expect(codeOf(await call('patch', '/security/policy', s).send({ passwordMinLength: 16 }).expect(403))).toBe('STEP_UP_REQUIRED');
        await call('post', '/auth/mfa/step-up', s).send({ factor: 'totp', code: '123456' }).expect(400);
      });

      it('removing a factor and regenerating recovery codes are step-up actions; the last required factor stays', async () => {
        const s = await signInWith(A().slug, ADMIN, passkeyProof(adminDevice));
        const { body } = await call('get', '/auth/mfa', s).expect(200);
        const factors = body.factors as { id: string }[];
        expect(factors).toHaveLength(2);
        await ageStepUp(s.sid, 16);
        expect(codeOf(await call('delete', `/auth/mfa/authenticators/${factors[1].id}`, s).expect(403))).toBe('STEP_UP_REQUIRED');
        expect(codeOf(await call('post', '/auth/mfa/recovery-codes', s).expect(403))).toBe('STEP_UP_REQUIRED');
        await stepUpWithPasskey(s, adminDevice);
        await call('delete', `/auth/mfa/authenticators/${factors[1].id}`, s).expect(204);
        await call('delete', `/auth/mfa/authenticators/${factors[0].id}`, s).expect(400); // last factor, MFA required
        const regenerated = await call('post', '/auth/mfa/recovery-codes', s).expect(200);
        expect(regenerated.body.recoveryCodes).toHaveLength(10);
        // Another tenant's admin cannot touch this factor.
        const b = await signIn(B().slug, ADMIN_B);
        await call('delete', `/auth/mfa/authenticators/${factors[0].id}`, b).expect(403); // no step-up possible...
        await tenantPrisma.forTenant(SUPER, (tx) => tx.session.update({ where: { id: b.sid }, data: { assuranceLevel: 'aal2', mfaVerifiedAt: new Date(), mfaMethod: 'totp' } }));
        await call('delete', `/auth/mfa/authenticators/${factors[0].id}`, b).expect(404); // ...and RLS hides it anyway
      });
    });
  });

  describe('the sensitive-role floor after the grace (YX-IAM-01)', () => {
    it('an admin past the grace at AAL1 is refused admin permissions until a factor is enrolled', async () => {
      await setDue(LATE, new Date(Date.now() - 60_000));
      const s = await signIn(A().slug, LATE);
      expect(codeOf(await call('get', '/security/sessions', s).expect(403))).toBe('MFA_REQUIRED');
      expect(codeOf(await call('get', '/security/policy', s).expect(403))).toBe('MFA_REQUIRED');
      // Everyday work and the enrolment itself stay open.
      await call('get', '/exams', s).expect(200);
      await call('get', '/auth/mfa', s).expect(200);
      await enrolPasskey(s);
      await call('get', '/security/sessions', s).expect(200);
    });

    it('proctor and evaluator actions need AAL2 past the grace; everyday exam work does not', async () => {
      await setDue(RECRUITER, new Date(Date.now() - 60_000));
      const s = await signIn(A().slug, RECRUITER);
      expect(codeOf(await call('post', `/attempts/${randomUUID()}/force-submit`, s).expect(403))).toBe('MFA_REQUIRED');
      expect(codeOf(await call('post', `/attempts/${randomUUID()}/answers/${randomUUID()}/grade`, s).send({ score: 1 }).expect(403))).toBe('MFA_REQUIRED');
      await call('get', '/exams', s).expect(200);
      await setDue(RECRUITER, new Date(Date.now() + 86_400_000));
      const inGrace = await signIn(A().slug, RECRUITER);
      expect(codeOf(await call('post', `/attempts/${randomUUID()}/force-submit`, inGrace))).not.toBe('MFA_REQUIRED');
    });

    it('a company requiring MFA for everyone extends the floor to every permission', async () => {
      await setDue(PANEL, new Date(Date.now() - 60_000));
      await tenantPrisma.forTenant(SUPER, (tx) =>
        tx.tenantSecurityPolicy.upsert({ where: { organizationId: A().id }, create: { organizationId: A().id, mfaScope: 'all' }, update: { mfaScope: 'all' } }),
      );
      invalidateTenantSecurityPolicy(A().id);
      try {
        const s = await signIn(A().slug, PANEL);
        expect(s.body.mfa).toEqual({ required: true, enrolmentDueAt: expect.any(String) });
        expect(codeOf(await call('get', '/users/teammates', s).expect(403))).toBe('MFA_REQUIRED');
      } finally {
        await tenantPrisma.forTenant(SUPER, (tx) => tx.tenantSecurityPolicy.update({ where: { organizationId: A().id }, data: { mfaScope: 'sensitive_roles' } }));
        invalidateTenantSecurityPolicy(A().id);
        await setDue(PANEL, new Date(Date.now() + 86_400_000));
      }
    });

    it('MFA management is refused while impersonating', async () => {
      const admin = await signIn(A().slug, ADMIN2);
      const res = await call('post', `/auth/impersonate/${users[PANEL]}`, admin).expect(200);
      const as = { access: res.body.accessToken as string, ip: admin.ip };
      await call('get', '/auth/mfa', as).expect(403);
      await call('post', '/auth/mfa/totp/setup', as).expect(403);
    });
  });

  describe('admin MFA reset (YX-IAM-11)', () => {
    // ADMIN2 enrols an authenticator app now, which leaves this session freshly stepped up.
    let admin2: Signed;
    beforeAll(async () => {
      admin2 = await signIn(A().slug, ADMIN2);
      await enrolTotp(admin2);
    });

    it('an ordinary account is reset by one admin: factors and sessions revoked, enrolment due at once', async () => {
      const panel = await signIn(A().slug, PANEL);
      await enrolTotp(panel);
      const res = await call('post', '/security/mfa-resets', admin2).send({ userId: users[PANEL], reason: 'Lost phone, verified by video call' }).expect(200);
      expect(res.body).toMatchObject({ status: 'completed' });

      expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.authenticator.count({ where: { userId: users[PANEL], revokedAt: null } }))).toBe(0);
      expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.recoveryCode.count({ where: { userId: users[PANEL] } }))).toBe(0);
      expect((await session(panel.sid)).revokedReason).toBe('mfa_reset');
      await call('get', '/auth/mfa', panel).expect(401);
      expect((await tenantPrisma.forTenant(SUPER, (tx) => tx.user.findUniqueOrThrow({ where: { id: users[PANEL] } }))).mfaEnrolmentDueAt.getTime()).toBeLessThanOrEqual(Date.now());
      expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: PANEL, subject: 'Two-step verification on your YukthiX account was reset' }));
      // Next sign-in is password only, straight into enrolment.
      const again = await signIn(A().slug, PANEL);
      expect(again.access).toEqual(expect.any(String));
      await setDue(PANEL, new Date(Date.now() + 86_400_000));
    });

    it('a sensitive-role account needs a second, different admin; requester and target cannot approve', async () => {
      const target = await signInWith(A().slug, TOTP_USER, async () => ({ factor: 'totp', code: await totp(secret) }));
      const requested = await call('post', '/security/mfa-resets', admin2).send({ userId: users[TOTP_USER], reason: 'Lost phone and recovery codes' }).expect(200);
      expect(requested.body).toMatchObject({ status: 'pending', id: expect.any(String) });
      expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.authenticator.count({ where: { userId: users[TOTP_USER], revokedAt: null } }))).toBe(1);
      expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ subject: 'A two-step verification reset needs your approval' }));
      await call('post', '/security/mfa-resets', admin2).send({ userId: users[TOTP_USER], reason: 'Second request for the same user' }).expect(409);

      const list = await call('get', '/security/mfa-resets', admin2).expect(200);
      expect(list.body).toEqual([expect.objectContaining({ id: requested.body.id, targetUser: expect.objectContaining({ email: TOTP_USER }) })]);

      // The requester cannot approve their own request; the target cannot approve their own reset.
      await call('post', `/security/mfa-resets/${requested.body.id}/approve`, admin2).expect(403);
      await call('post', `/security/mfa-resets/${requested.body.id}/approve`, target).expect(403);
      // Another tenant's admin cannot see or approve it.
      const b = await signIn(B().slug, ADMIN_B);
      await tenantPrisma.forTenant(SUPER, (tx) => tx.session.update({ where: { id: b.sid }, data: { assuranceLevel: 'aal2', mfaVerifiedAt: new Date(), mfaMethod: 'totp' } }));
      await call('post', `/security/mfa-resets/${requested.body.id}/approve`, b).expect(404);
      expect((await call('get', '/security/mfa-resets', b).expect(200)).body).toEqual([]);
      await call('post', '/security/mfa-resets', b).send({ userId: users[TOTP_USER], reason: 'Cross-tenant attempt here' }).expect(404);

      const approver = await signInWith(A().slug, ADMIN, passkeyProof(adminDevice));
      await ageStepUp(approver.sid, 16);
      expect(codeOf(await call('post', `/security/mfa-resets/${requested.body.id}/approve`, approver).expect(403))).toBe('STEP_UP_REQUIRED');
      await stepUpWithPasskey(approver, adminDevice);
      await call('post', `/security/mfa-resets/${requested.body.id}/approve`, approver).expect(200);
      await call('post', `/security/mfa-resets/${requested.body.id}/approve`, approver).expect(404); // handled once

      expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.authenticator.count({ where: { userId: users[TOTP_USER], revokedAt: null } }))).toBe(0);
      expect((await session(target.sid)).revokedReason).toBe('mfa_reset');
      const [row] = await tenantPrisma.forTenant(SUPER, (tx) => tx.mfaResetRequest.findMany({ where: { id: requested.body.id } }));
      expect(row).toMatchObject({ status: 'completed', requestedByUserId: users[ADMIN2], approvedByUserId: users[ADMIN] });
      expect((await auditActions(A().id, 'mfa.reset')).map((a) => a.entityId)).toContain(users[TOTP_USER]);
    });

    it('nobody resets their own MFA, and the database refuses one person in two roles', async () => {
      await call('post', '/security/mfa-resets', admin2).send({ userId: users[ADMIN2], reason: 'Trying to reset myself' }).expect(403);
      await expect(
        tenantPrisma.forTenant(SUPER, (tx) =>
          tx.mfaResetRequest.create({
            data: { organizationId: A().id, targetUserId: users[PANEL], requestedByUserId: users[ADMIN2], approvedByUserId: users[ADMIN2], status: 'completed', reason: 'x', expiresAt: new Date() },
          }),
        ),
      ).rejects.toThrow(/mfa_reset_requests_people_check/);
    });

    it('requesting a reset is itself a step-up action', async () => {
      await ageStepUp(admin2.sid, 16);
      expect(codeOf(await call('post', '/security/mfa-resets', admin2).send({ userId: users[PANEL], reason: 'Lost phone, verified in person' }).expect(403))).toBe('STEP_UP_REQUIRED');
    });
  });
});
