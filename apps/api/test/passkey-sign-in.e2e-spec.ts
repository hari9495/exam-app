import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { createHash, randomUUID } from 'crypto';
import cookieParser from 'cookie-parser';
import Redis from 'ioredis';
import { JwtService } from '@nestjs/jwt';
import { PrismaService, TenantPrismaService, invalidateTenantSecurityPolicy } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ipBucket } from '../src/auth/login-protection.service';
import { SoftAuthenticator } from './fixtures/soft-authenticator';

// Passwordless passkey sign-in end to end (founder decision 7 Oct 2026; US-A-039, D-075), against
// the real database and Redis, with a real software authenticator: a user-verifying passkey is the
// whole sign-in at AAL2, under the same company rules, counters and alerts as a password.
describe('Sign in with a passkey (passwordless, AAL2)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let redis: Redis;
  const jwt = new JwtService({});
  const email = { send: jest.fn().mockResolvedValue({ success: true }) };
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const runId = randomUUID().slice(0, 8);
  const emailOf = (name: string) => `${name}-${runId}@passkey.test`;
  let planId: string;
  const orgs: Record<'a' | 'nopasskey' | 'sso', { id: string; slug: string }> = {} as never;
  const users: Record<string, string> = {};
  const devices: Record<string, SoftAuthenticator> = {};
  const ADMIN = emailOf('admin'); // org_admin: MFA required, enrols through the API
  const PANEL = emailOf('panel');
  const LOCKME = emailOf('lockme');
  const NOPASS = emailOf('nopass'); // company allows authenticator apps only
  const NOFACTOR = emailOf('nofactor'); // same company, password only (remembers it on a device)
  const SSO = emailOf('sso'); // company is SSO-only
  const STAFF = emailOf('staff'); // YukthiX platform staff

  let ipSeq = 0;
  const freshIp = () => `2001:db8:${runId.slice(0, 4)}:${(++ipSeq).toString(16)}::1`;
  const server = () => app.getHttpServer();
  const cookieOf = (res: request.Response, name: string) =>
    ((res.headers['set-cookie'] as unknown as string[] | undefined) ?? []).find((c) => c.startsWith(`${name}=`))?.split(';')[0];
  const newDevice = () => `yx_device=${randomUUID().replace(/-/g, '').padEnd(43, 'x').slice(0, 43)}`;

  // options -> authenticator -> verify, from one browser (device cookie) and IP.
  async function passkeySignIn(
    device: SoftAuthenticator,
    opts: { cookie?: string; ip?: string; overrides?: Parameters<SoftAuthenticator['assert']>[1]; verifyCookie?: string } = {},
  ) {
    const cookie = opts.cookie ?? newDevice();
    const ip = opts.ip ?? freshIp();
    const options = await request(server()).post('/api/v1/auth/passkey/options').set('Cookie', cookie).set('X-Forwarded-For', ip).expect(200);
    const credential = device.assert(options.body, opts.overrides);
    const res = await request(server()).post('/api/v1/auth/passkey/verify').set('Cookie', opts.verifyCookie ?? cookie).set('X-Forwarded-For', ip).send({ credential });
    return { res, options: options.body, credential, cookie, ip };
  }

  const events = (who: string) => tenantPrisma.forTenant(SUPER, (tx) => tx.loginEvent.findMany({ where: { userId: users[who] }, orderBy: { createdAt: 'desc' } }));
  const lastEvent = async (who: string) => (await events(who))[0];
  const setPolicy = async (organizationId: string, data: Record<string, unknown>) => {
    await tenantPrisma.forTenant(SUPER, (tx) => tx.tenantSecurityPolicy.upsert({ where: { organizationId }, create: { organizationId, ...data }, update: data }));
    invalidateTenantSecurityPolicy(organizationId);
  };
  // A passkey row as the enrolment would store it (for accounts whose own enrolment is not under test).
  async function givePasskey(who: string, organizationId: string | null) {
    const device = new SoftAuthenticator();
    device.userHandle = Buffer.from(users[who]).toString('base64url');
    await tenantPrisma.forTenant(SUPER, (tx) =>
      tx.authenticator.create({
        data: { organizationId, userId: users[who], type: 'passkey', label: 'Chrome on Windows', credentialId: device.id, publicKey: Buffer.from(device.cosePublicKey), transports: ['internal'] },
      }),
    );
    devices[who] = device;
  }
  const until = async (check: () => boolean) => {
    for (let i = 0; i < 50 && !check(); i++) await new Promise((r) => setTimeout(r, 20));
    return check();
  };

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

    planId = (await prisma.plan.create({ data: { name: `passkey-plan-${runId}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const key of ['a', 'nopasskey', 'sso'] as const) {
      const org = await prisma.organization.create({ data: { name: `Passkey ${key}`, slug: `pk-${key}-${runId}`, planId } });
      orgs[key] = { id: org.id, slug: org.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const seed: [keyof typeof orgs | null, string, string][] = [
      ['a', ADMIN, 'org_admin'],
      ['a', PANEL, 'panel'],
      ['a', LOCKME, 'panel'],
      ['nopasskey', NOPASS, 'panel'],
      ['nopasskey', NOFACTOR, 'panel'],
      ['sso', SSO, 'panel'],
      [null, STAFF, 'super_admin'],
    ];
    for (const [org, who, role] of seed) {
      const organizationId = org ? orgs[org].id : null;
      const row = await tenantPrisma.forTenant(organizationId ? { organizationId, isSuperAdmin: false } : SUPER, (tx) =>
        tx.user.create({ data: { organizationId, email: who, passwordHash, role } }),
      );
      users[who] = row.id;
    }
    await setPolicy(orgs.nopasskey.id, { allowedFactors: ['totp'] });
    await setPolicy(orgs.sso.id, { ssoOnly: true, breakGlassUserIds: [randomUUID(), randomUUID()] }); // the floor needs two named
    await setPolicy(orgs.a.id, { maxFailedAttempts: 3 });
    for (const [who, org] of [[PANEL, orgs.a.id], [LOCKME, orgs.a.id], [NOPASS, orgs.nopasskey.id], [SSO, orgs.sso.id], [STAFF, null]] as const) {
      await givePasskey(who, org);
    }
  });

  beforeEach(() => email.send.mockClear());

  afterAll(async () => {
    const ids = Object.values(orgs).map((o) => o.id);
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        await tx.refreshToken.deleteMany({ where: { userId: { in: Object.values(users) } } });
        await tx.user.deleteMany({ where: { id: { in: Object.values(users) } } });
        await tx.tenantSecurityPolicy.deleteMany({ where: { organizationId: { in: ids } } });
      })
      .catch(() => undefined);
    await tenantPrisma.forTenant(SUPER, (tx) => tx.organization.deleteMany({ where: { id: { in: ids } } })).catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    redis.disconnect();
    await app.close();
  });

  describe('happy path', () => {
    let device: SoftAuthenticator;

    it('a new passkey is enrolled as discoverable and user-verifying', async () => {
      const ip = freshIp();
      const first = await request(server()).post('/api/v1/auth/staff/login').set('X-Forwarded-For', ip).send({ organizationSlug: orgs.a.slug, email: ADMIN, password: PASSWORD }).expect(200);
      const auth = { Authorization: `Bearer ${first.body.accessToken}`, 'X-Forwarded-For': ip };
      const options = await request(server()).post('/api/v1/auth/mfa/passkeys/registration-options').set(auth).expect(200);
      expect(options.body.authenticatorSelection).toMatchObject({ residentKey: 'required', userVerification: 'required' });
      device = new SoftAuthenticator();
      await request(server()).post('/api/v1/auth/mfa/passkeys').set(auth).send({ credential: device.register(options.body), label: 'Chrome on Windows' }).expect(200);
      expect(device.userHandle).toBe(Buffer.from(users[ADMIN]).toString('base64url'));
    });

    it('options carry no allowCredentials and require user verification', async () => {
      const options = await request(server()).post('/api/v1/auth/passkey/options').set('X-Forwarded-For', freshIp()).expect(200);
      expect(options.body).toMatchObject({ rpId: 'localhost', userVerification: 'required', challenge: expect.any(String) });
      expect(options.body.allowCredentials ?? []).toEqual([]);
      expect(cookieOf(options, 'yx_device')).toBeDefined(); // the challenge is bound to this new device cookie
    });

    it('the passkey alone signs in at AAL2: no password, no second step, the MFA requirement met, alerts and history as any sign-in', async () => {
      const { res, ip } = await passkeySignIn(device);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ accessToken: expect.any(String) }); // no mfaRequired, no "set up two-step" prompt
      expect(cookieOf(res, 'refresh_token')).toBeDefined();
      expect(cookieOf(res, 'yx_company')).toBeDefined(); // the company is remembered on this device
      const sid = (jwt.decode(res.body.accessToken) as { sid: string }).sid;
      expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.session.findUniqueOrThrow({ where: { id: sid } }))).toMatchObject({
        method: 'passkey',
        assuranceLevel: 'aal2',
        mfaMethod: 'passkey',
        mfaVerifiedAt: expect.any(Date),
      });
      expect(await lastEvent(ADMIN)).toMatchObject({ result: 'success', method: 'passkey', reason: null, newDevice: true, sessionId: sid });
      expect(await until(() => email.send.mock.calls.some(([m]) => m.to === ADMIN && m.subject === 'New sign-in to your YukthiX account'))).toBe(true);
      // AAL2 just now: a step-up action goes through without "Confirm it's you".
      await request(server()).post('/api/v1/auth/mfa/recovery-codes').set('Authorization', `Bearer ${res.body.accessToken}`).set('X-Forwarded-For', ip).expect(200);
    });
  });

  describe('refused', () => {
    it('an unknown credential: 401, logged, counted against the IP', async () => {
      const stranger = new SoftAuthenticator();
      stranger.userHandle = Buffer.from(randomUUID()).toString('base64url');
      const ip = freshIp();
      const ipFails = `auth:lp:ip:fail:${ipBucket(ip)}`;
      const { res } = await passkeySignIn(stranger, { ip });
      expect(res.status).toBe(401);
      expect(res.body.message).toBe("We couldn't sign you in with that passkey. If you see more than one, pick the one you made for this site, or sign in with your email.");
      expect(cookieOf(res, 'refresh_token')).toBeUndefined();
      expect(Number(await redis.get(ipFails))).toBe(1);
      const [event] = await tenantPrisma.forTenant(SUPER, (tx) => tx.loginEvent.findMany({ where: { method: 'passkey', reason: 'unknown_credential', ipAddress: ip } }));
      expect(event).toMatchObject({ result: 'failed', userId: null });
    });

    it('a wrong origin (phishing site) or a wrong RP', async () => {
      expect((await passkeySignIn(devices[PANEL], { overrides: { origin: 'https://yukthix-login.example' } })).res.status).toBe(401);
      expect(await lastEvent(PANEL)).toMatchObject({ result: 'failed', method: 'passkey', reason: 'passkey_invalid' });

      const otherRp = new SoftAuthenticator('evil.example');
      (otherRp as unknown as { credentialId: Buffer }).credentialId = Buffer.from(devices[PANEL].id, 'base64url');
      otherRp.userHandle = devices[PANEL].userHandle;
      otherRp.counter = devices[PANEL].counter + 1;
      expect((await passkeySignIn(otherRp)).res.status).toBe(401);
      // The genuine one still works (and clears the counter).
      expect((await passkeySignIn(devices[PANEL])).res.status).toBe(200);
    });

    it('a replayed assertion, and a challenge redeemed from another device', async () => {
      const first = await passkeySignIn(devices[PANEL]);
      expect(first.res.status).toBe(200);
      const replay = await request(server()).post('/api/v1/auth/passkey/verify').set('Cookie', first.cookie).set('X-Forwarded-For', first.ip).send({ credential: first.credential });
      expect(replay.status).toBe(401);
      const replayed = await tenantPrisma.forTenant(SUPER, (tx) => tx.loginEvent.findMany({ where: { method: 'passkey', reason: 'passkey_challenge_invalid', ipAddress: first.ip } }));
      expect(replayed).toHaveLength(1);

      const elsewhere = await passkeySignIn(devices[PANEL], { verifyCookie: newDevice() });
      expect(elsewhere.res.status).toBe(401);
      const [event] = await tenantPrisma.forTenant(SUPER, (tx) => tx.loginEvent.findMany({ where: { method: 'passkey', reason: 'passkey_challenge_invalid', ipAddress: elsewhere.ip } }));
      expect(event).toBeDefined();
    });

    it('YukthiX staff: never here (they use /staff/sign-in)', async () => {
      const { res } = await passkeySignIn(devices[STAFF]);
      expect(res.status).toBe(401);
      expect(await lastEvent(STAFF)).toMatchObject({ result: 'failed', method: 'passkey', reason: 'platform_staff' });
    });

    it('a company that does not allow passkeys', async () => {
      expect((await passkeySignIn(devices[NOPASS])).res.status).toBe(401);
      expect(await lastEvent(NOPASS)).toMatchObject({ result: 'failed', method: 'passkey', reason: 'passkey_disabled' });
    });

    it('an SSO-only company', async () => {
      expect((await passkeySignIn(devices[SSO])).res.status).toBe(401);
      expect(await lastEvent(SSO)).toMatchObject({ result: 'failed', method: 'passkey', reason: 'sso_only' });
    });

    it('another company than the one remembered on this device', async () => {
      const ip = freshIp();
      const nopass = await request(server()).post('/api/v1/auth/staff/login').set('X-Forwarded-For', ip).send({ organizationSlug: orgs.nopasskey.slug, email: NOFACTOR, password: PASSWORD }).expect(200);
      const cookie = [cookieOf(nopass, 'yx_device'), cookieOf(nopass, 'yx_company')].join('; ');
      expect((await passkeySignIn(devices[PANEL], { cookie, ip })).res.status).toBe(401);
      expect(await lastEvent(PANEL)).toMatchObject({ result: 'failed', method: 'passkey', reason: 'other_company' });
    });
  });

  describe('lockout (the company settings, shared with the password)', () => {
    it('wrong assertions lock the account, then even the genuine passkey and the password are refused; the holder is told', async () => {
      const account = createHash('sha256').update(`${orgs.a.slug}\u0000${LOCKME}`).digest('hex');
      for (let i = 1; i <= 3; i++) {
        await redis.del(`auth:lp:acct:block:${account}`); // skip any progressive delay, keep the count
        expect((await passkeySignIn(devices[LOCKME], { overrides: { tamper: true } })).res.status).toBe(401);
      }
      expect(await lastEvent(LOCKME)).toMatchObject({ result: 'failed', reason: 'passkey_invalid+lockout_started' });
      expect(await until(() => email.send.mock.calls.some(([m]) => m.to === LOCKME && m.subject === 'Sign-in to your YukthiX account was temporarily locked'))).toBe(true);

      expect((await passkeySignIn(devices[LOCKME])).res.status).toBe(429);
      expect(await lastEvent(LOCKME)).toMatchObject({ result: 'locked', method: 'passkey', reason: 'account_locked' });
      await request(server()).post('/api/v1/auth/staff/login').set('X-Forwarded-For', freshIp()).send({ organizationSlug: orgs.a.slug, email: LOCKME, password: PASSWORD }).expect(429);
    });
  });

  it('sign-in options say whether the known company allows passkeys', async () => {
    const ask = async (slug?: string) => {
      const req = request(server()).get('/api/v1/auth/sign-in-options').set('X-Forwarded-For', freshIp());
      if (slug) {
        const res = await request(server()).post('/api/v1/auth/staff/login').set('X-Forwarded-For', freshIp()).send({ organizationSlug: slug, email: NOFACTOR, password: PASSWORD });
        req.set('Cookie', cookieOf(res, 'yx_company') ?? '');
      }
      return (await req.expect(200)).body.passkey;
    };
    expect(await ask()).toBe(true);
    expect(await ask(orgs.nopasskey.slug)).toBe(false);
  });
});
