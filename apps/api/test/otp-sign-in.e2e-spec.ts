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
import { OrgSecretsCryptoService, PrismaService, STEP_UP_REQUIRED_CODE, TenantPrismaService, invalidateTenantSecurityPolicy } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { DevSmsSink, devSmsSink } from '../src/sms/providers';
import { trackOtpSends } from './fixtures/sms';
import { OTP_SMS_SENDER } from '../src/auth/otp-sender';
import { OTP_MAX_ATTEMPTS, OtpService } from '../src/auth/otp.service';
import { markSteppedUp } from './fixtures/step-up';

// P12 Part 1d end to end, against the real database (forced RLS, app role) and real Redis:
// one-time-code sign-in by email and mobile number (AAL1, M04 Q2), the SMS / WhatsApp fallback
// second factor (YX-IAM-03), mobile-number verification, and the abuse limits (YX-IAM-07).
// Codes are read from the mocked EmailService and the in-memory SMS sink, as a person would.
describe('one-time-code sign-in and OTP fallback factor (P12 §3, YX-IAM-03/07/10, M04 Q2)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let prisma: PrismaService;
  let redis: Redis;
  const sms: DevSmsSink = devSmsSink;
  let settle: () => Promise<void>;
  const jwt = new JwtService({});
  const email = { send: jest.fn().mockResolvedValue({ success: true }) };
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const runId = randomUUID().slice(0, 8);
  const emailOf = (name: string) => `${name}-${runId}@otp.test`;
  const OTP_PLUGINS = { crypto: new NodeCryptoPlugin(), base32: createBase32Plugin({ encode: base32.encode, decode: base32.decode }) };
  // Distinct per run, valid Indian mobile numbers (98xxxxxxxx).
  const mobileSeed = Number.parseInt(runId.slice(0, 6), 16) % 900_000;
  const mobile = (n: number) => `+9198${String(mobileSeed + n * 1000).padStart(8, '0')}`;

  let planId: string;
  const orgs: { id: string; slug: string }[] = [];
  const users: Record<string, string> = {};
  const A = () => orgs[0];
  const B = () => orgs[1];
  const OFF = () => orgs[2];
  const FIELD = emailOf('field'); // panel: no factor; signs in by code
  const MOBILE_USER = emailOf('mobile'); // panel: verifies a mobile number, then signs in with it
  const TWO_STEP = emailOf('two-step'); // panel with TOTP + verified mobile: OTP fallback allowed
  const ADMIN = emailOf('admin'); // org admin with TOTP + verified mobile: OTP fallback barred
  const LOCKED = emailOf('locked');
  const FIELD_B = emailOf('field-b');

  let ipSeq = 0;
  const freshIp = () => `2001:db8:${runId.slice(0, 4)}:${(++ipSeq).toString(16)}::7`;
  const server = () => app.getHttpServer();
  const sha = (v: string) => createHash('sha256').update(v).digest('hex');
  const deviceOf = (res: request.Response) =>
    ((res.headers['set-cookie'] as unknown as string[] | undefined) ?? []).find((c) => c.startsWith('yx_device='))?.split(';')[0];
  const refreshCookieOf = (res: request.Response) =>
    ((res.headers['set-cookie'] as unknown as string[] | undefined) ?? []).find((c) => c.startsWith('refresh_token='));

  const lastEmailCode = (to: string): string | undefined => {
    const call = [...email.send.mock.calls].reverse().find(([m]) => m.to === to && /code/.test(m.subject));
    return call?.[0].html.match(/<b>(\d{6})<\/b>/)?.[1];
  };
  // Codes go out fire-and-forget: wait for sends already started, then read the dev sink.
  const lastSmsCode = async (to: string) => {
    await settle();
    return [...sms.sent].reverse().find((m) => m.to === to)?.text.slice(0, 6);
  };

  // A browser: one device cookie and one client IP.
  interface Browser {
    ip: string;
    cookie?: string;
  }
  const browser = (): Browser => ({ ip: freshIp() });
  function post(b: Browser, path: string, body: object, bearer?: string) {
    const req = request(server()).post(`/api/v1${path}`).set('X-Forwarded-For', b.ip);
    if (b.cookie) req.set('Cookie', b.cookie);
    if (bearer) req.set('Authorization', `Bearer ${bearer}`);
    // The browser keeps the device cookie the API sets on its first response.
    return {
      expect: async (status: number) => {
        const res = await req.send(body);
        b.cookie ??= deviceOf(res);
        if (res.status !== status) throw new Error(`POST ${path}: expected ${status}, got ${res.status} ${JSON.stringify(res.body)}`);
        return res;
      },
    };
  }
  const startOtp = (b: Browser, slug: string, identifier: string, channel?: string) =>
    post(b, '/auth/otp/start', { organizationSlug: slug, identifier, ...(channel ? { channel } : {}) });
  const verifyOtp = (b: Browser, slug: string, identifier: string, otpToken: string, code: string) =>
    post(b, '/auth/otp/verify', { organizationSlug: slug, identifier, otpToken, code });

  // Clears the resend cooldown / hourly counters and the lockout for an identifier between steps
  // that would otherwise have to wait for the clock (each limit is proven on its own below).
  const limitKey = (subject: string) => sha(subject);
  const lockKey = (slug: string, identifier: string) => sha(`${slug}\u0000${identifier}`);
  // An identifier's lock keys: the company's and its own across companies (W-016).
  const lockBlocks = (slug: string, identifier: string) => [slug, '*'].map((scope) => `auth:lp:acct:block:${lockKey(scope, identifier)}`);
  async function resetLimits(slug: string, identifier: string) {
    const s = limitKey(`signin\u0000${slug}\u0000${identifier}`);
    const fails = [slug, '*'].map((scope) => `auth:lp:acct:fail:${lockKey(scope, identifier)}`);
    await redis.del(`auth:otp:cool:${s}`, `auth:otp:sends:${s}`, ...fails, ...lockBlocks(slug, identifier));
  }

  async function signInByCode(slug: string, who: string, opts: { identifier?: string; channel?: string } = {}) {
    const b = browser();
    const identifier = opts.identifier ?? who;
    const started = await startOtp(b, slug, identifier, opts.channel).expect(200);
    const code = opts.identifier ? (await lastSmsCode(identifier))! : lastEmailCode(who)!;
    const res = await verifyOtp(b, slug, identifier, started.body.otpToken, code).expect(200);
    await resetLimits(slug, identifier);
    return { b, res, code, otpToken: started.body.otpToken as string };
  }

  async function passwordLogin(slug: string, who: string) {
    const b = browser();
    const res = await post(b, '/auth/staff/login', { organizationSlug: slug, email: who, password: PASSWORD }).expect(200);
    return { b, res };
  }

  const session = (id: string) => tenantPrisma.forTenant(SUPER, (tx) => tx.session.findUniqueOrThrow({ where: { id } }));
  const sidOf = (access: string) => (jwt.decode(access) as { sid: string }).sid;
  const events = (who: string) => tenantPrisma.forTenant(SUPER, (tx) => tx.loginEvent.findMany({ where: { userId: users[who] }, orderBy: { createdAt: 'desc' } }));
  const eventsFor = (identifier: string) => tenantPrisma.forTenant(SUPER, (tx) => tx.loginEvent.findMany({ where: { identifier }, orderBy: { createdAt: 'desc' } }));
  const auditActions = (organizationId: string, action: string) =>
    tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { organizationId, action }, orderBy: { createdAt: 'desc' } }));
  const setPolicy = async (organizationId: string, data: object) => {
    await tenantPrisma.forTenant(SUPER, (tx) => tx.tenantSecurityPolicy.upsert({ where: { organizationId }, create: { organizationId, ...data }, update: data }));
    invalidateTenantSecurityPolicy(organizationId);
  };
  const setVerifiedMobile = (who: string, number: string) =>
    tenantPrisma.forTenant(SUPER, (tx) => tx.user.update({ where: { id: users[who] }, data: { mobileNumber: number, mobileVerifiedAt: new Date() } }));
  const totp = (secret: string, offsetSteps = 0) => totpAt({ ...OTP_PLUGINS, secret, epoch: Math.floor(Date.now() / 1000) + offsetSteps * 30 });

  // A TOTP factor written straight to the table (the enrolment flow itself is proven in mfa.e2e).
  async function giveTotp(who: string, organizationId: string): Promise<string> {
    const secret = base32.encode(Buffer.from(randomUUID().replace(/-/g, '').slice(0, 20)));
    const secretEncrypted = app.get(OrgSecretsCryptoService).encrypt(secret);
    await tenantPrisma.forTenant(SUPER, (tx) => tx.authenticator.create({ data: { organizationId, userId: users[who], type: 'totp', label: 'Phone', secretEncrypted } }));
    return secret;
  }
  let twoStepSecret: string;
  let adminSecret: string;

  beforeAll(async () => {
    const tracked = trackOtpSends(Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue(email));
    settle = tracked.settle;
    const moduleRef = await tracked.builder.compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.getHttpAdapter().getInstance().set('trust proxy', true);
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');

    planId = (await prisma.plan.create({ data: { name: `otp-plan-${runId}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const label of ['a', 'b', 'off']) {
      const org = await prisma.organization.create({ data: { name: `OTP ${label}`, slug: `otp-${label}-${runId}`, planId } });
      orgs.push({ id: org.id, slug: org.slug });
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const seed: [number, string, string][] = [
      [0, FIELD, 'panel'],
      [0, MOBILE_USER, 'panel'],
      [0, TWO_STEP, 'panel'],
      [0, ADMIN, 'org_admin'],
      [0, LOCKED, 'panel'],
      [1, FIELD_B, 'panel'],
    ];
    for (const [i, who, role] of seed) {
      const organizationId = orgs[i].id;
      users[who] = (await tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId, email: who, passwordHash, role } }))).id;
    }
    const allOn = { otpSignInChannels: ['email', 'sms', 'whatsapp'], allowedFactors: ['passkey', 'totp', 'otp'] };
    await setPolicy(A().id, allOn);
    await setPolicy(B().id, allOn);
    twoStepSecret = await giveTotp(TWO_STEP, A().id);
    adminSecret = await giveTotp(ADMIN, A().id);
    await setVerifiedMobile(TWO_STEP, mobile(3));
    await setVerifiedMobile(ADMIN, mobile(4));
  });

  beforeEach(() => email.send.mockClear());

  afterAll(async () => {
    const ids = orgs.map((o) => o.id);
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        await tx.refreshToken.deleteMany({ where: { user: { organizationId: { in: ids } } } });
        await tx.user.deleteMany({ where: { organizationId: { in: ids } } });
        await tx.tenantSecurityPolicy.deleteMany({ where: { organizationId: { in: ids } } });
      })
      .catch(() => undefined);
    await tenantPrisma.forTenant(SUPER, (tx) => tx.organization.deleteMany({ where: { id: { in: ids } } })).catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    redis.disconnect();
    await app.close();
  });

  describe('sign-in by email code (AAL1)', () => {
    // Answered exactly like an unknown organisation (no organisation recon); nothing is sent.
    it('is off unless the company turns it on', async () => {
      const off = await startOtp(browser(), OFF().slug, FIELD).expect(200);
      const unknown = await startOtp(browser(), `no-such-org-${runId}`, FIELD).expect(200);
      expect(Object.keys(off.body).sort()).toEqual(Object.keys(unknown.body).sort());
      expect(email.send).not.toHaveBeenCalled();
      const [event] = await tenantPrisma.forTenant(SUPER, (tx) =>
        tx.loginEvent.findMany({ where: { organizationId: OFF().id, reason: 'otp_disabled' }, orderBy: { createdAt: 'desc' }, take: 1 }),
      );
      expect(event).toBeDefined();
    });

    it('a code by email opens an AAL1 session with a refresh cookie, recorded as otp_email', async () => {
      const b = browser();
      const started = await startOtp(b, A().slug, FIELD.toUpperCase()).expect(200);
      expect(started.body).toEqual({ otpToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/), expiresInSeconds: 300, resendAfterSeconds: 60 });
      expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: FIELD, subject: 'Your YukthiX sign-in code', organizationId: A().id }));
      const code = lastEmailCode(FIELD)!;

      // Stored as a keyed hash only, for at most 5 minutes.
      const key = `auth:otp:signin:${sha(`${A().slug}\u0000${FIELD}`)}`;
      const stored = await redis.hgetall(key);
      expect(JSON.stringify(stored)).not.toContain(code);
      expect(stored).toMatchObject({ userId: users[FIELD], channel: 'email', attempts: '0', mac: expect.stringMatching(/^[0-9a-f]{64}$/) });
      expect(await redis.ttl(key)).toBeLessThanOrEqual(300);

      const res = await verifyOtp(b, A().slug, FIELD, started.body.otpToken, code).expect(200);
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(refreshCookieOf(res)).toMatch(/HttpOnly/);
      const sid = sidOf(res.body.accessToken);
      expect(await session(sid)).toMatchObject({ method: 'otp_email', assuranceLevel: 'aal1', mfaVerifiedAt: null });
      expect(await events(FIELD)).toEqual(expect.arrayContaining([expect.objectContaining({ result: 'success', method: 'otp_email', sessionId: sid })]));
      expect(await auditActions(A().id, 'login.success')).toEqual(expect.arrayContaining([expect.objectContaining({ actorUserId: users[FIELD] })]));

      // Replayed: the code was spent by the sign-in.
      await verifyOtp(b, A().slug, FIELD, started.body.otpToken, code).expect(401);
      await resetLimits(A().slug, FIELD);
    });

    it('no enumeration: an unknown email gets the same answer and no email; any code then fails and is logged', async () => {
      const ghost = emailOf('ghost');
      const b = browser();
      const started = await startOtp(b, A().slug, ghost).expect(200);
      expect(Object.keys(started.body).sort()).toEqual(['expiresInSeconds', 'otpToken', 'resendAfterSeconds']);
      expect(email.send).not.toHaveBeenCalled();
      await verifyOtp(b, A().slug, ghost, started.body.otpToken, '123456').expect(401);
      expect(await eventsFor(ghost)).toEqual([expect.objectContaining({ result: 'failed', method: 'otp_email', reason: 'otp_invalid', userId: null, organizationId: A().id })]);
      // ...and the same resend cooldown as a real account.
      expect((await startOtp(browser(), A().slug, ghost).expect(429)).body.retryAfterSeconds).toBeGreaterThan(0);
      await resetLimits(A().slug, ghost);
    });

    it('wrong tenant: an account of company A asking at company B gets nothing, and A\'s code is no good at B', async () => {
      const atA = browser();
      const a = await startOtp(atA, A().slug, FIELD).expect(200);
      const codeA = lastEmailCode(FIELD)!;
      email.send.mockClear();
      const atB = browser();
      const b = await startOtp(atB, B().slug, FIELD).expect(200);
      expect(email.send).not.toHaveBeenCalled();
      await verifyOtp(atB, B().slug, FIELD, b.body.otpToken, codeA).expect(401);
      // A's code still works at A, from A's browser.
      await verifyOtp(atA, A().slug, FIELD, a.body.otpToken, codeA).expect(200);
      await resetLimits(A().slug, FIELD);
      await resetLimits(B().slug, FIELD);
    });

    it('the code only works from the browser that asked for it, with its token', async () => {
      const b = browser();
      const started = await startOtp(b, A().slug, FIELD).expect(200);
      const code = lastEmailCode(FIELD)!;
      await verifyOtp({ ip: b.ip, cookie: `yx_device=${'q'.repeat(43)}` }, A().slug, FIELD, started.body.otpToken, code).expect(401);
      await verifyOtp(b, A().slug, FIELD, 'A'.repeat(43), code).expect(401);
      await verifyOtp(b, A().slug, FIELD, started.body.otpToken, code).expect(200);
      await resetLimits(A().slug, FIELD);
    });

    it('expired: a code past its 5 minutes is refused', async () => {
      const b = browser();
      const started = await startOtp(b, A().slug, FIELD).expect(200);
      const code = lastEmailCode(FIELD)!;
      await redis.pexpire(`auth:otp:signin:${sha(`${A().slug}\u0000${FIELD}`)}`, 1);
      await new Promise((r) => setTimeout(r, 20));
      await verifyOtp(b, A().slug, FIELD, started.body.otpToken, code).expect(401);
      await resetLimits(A().slug, FIELD);
    });

    it('a new code replaces the previous one', async () => {
      const b = browser();
      const first = await startOtp(b, A().slug, FIELD).expect(200);
      const oldCode = lastEmailCode(FIELD)!;
      await redis.del(`auth:otp:cool:${limitKey(`signin\u0000${A().slug}\u0000${FIELD}`)}`);
      const second = await startOtp(b, A().slug, FIELD).expect(200);
      const newCode = lastEmailCode(FIELD)!;
      if (oldCode !== newCode) await verifyOtp(b, A().slug, FIELD, first.body.otpToken, oldCode).expect(401);
      await verifyOtp(b, A().slug, FIELD, second.body.otpToken, newCode).expect(200);
      await resetLimits(A().slug, FIELD);
    });

    it(`brute force: the ${OTP_MAX_ATTEMPTS}th wrong try burns the code, so even the right one then fails`, async () => {
      const b = browser();
      const started = await startOtp(b, A().slug, FIELD).expect(200);
      const code = lastEmailCode(FIELD)!;
      const wrong = code === '000000' ? '111111' : '000000';
      for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
        await redis.del(...lockBlocks(A().slug, FIELD)); // skip the progressive delay, keep the count
        await verifyOtp(b, A().slug, FIELD, started.body.otpToken, wrong).expect(401);
      }
      await redis.del(...lockBlocks(A().slug, FIELD));
      await verifyOtp(b, A().slug, FIELD, started.body.otpToken, code).expect(401);
      await resetLimits(A().slug, FIELD);
    });

    it('brute force across codes: the shared account lockout locks after 10 failures and tells the user', async () => {
      const ip = freshIp();
      for (let i = 0; i < 10; i++) {
        await redis.del(`auth:otp:cool:${limitKey(`signin\u0000${A().slug}\u0000${LOCKED}`)}`, ...lockBlocks(A().slug, LOCKED));
        const b = { ip };
        const started = await startOtp(b, A().slug, LOCKED).expect(200);
        const code = lastEmailCode(LOCKED)!;
        await verifyOtp(b, A().slug, LOCKED, started.body.otpToken, code === '000000' ? '111111' : '000000').expect(401);
        if (i === 4) await redis.del(`auth:otp:sends:${limitKey(`signin\u0000${A().slug}\u0000${LOCKED}`)}`); // hourly cap, proven below
      }
      const locked = await startOtp(browser(), A().slug, LOCKED).expect(429);
      expect(locked.body.retryAfterSeconds).toBeGreaterThan(800);
      expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: LOCKED, subject: 'Sign-in to your YukthiX account was temporarily locked' }));
      expect(await eventsFor(LOCKED)).toEqual(expect.arrayContaining([
        expect.objectContaining({ result: 'failed', method: 'otp_email', reason: 'otp_invalid+lockout_started' }),
        expect.objectContaining({ result: 'locked', method: 'otp_email' }),
      ]));
      await resetLimits(A().slug, LOCKED);
    });

    it('resend cooldown, then the hourly cap per identifier', async () => {
      const subject = limitKey(`signin\u0000${A().slug}\u0000${FIELD}`);
      await startOtp(browser(), A().slug, FIELD).expect(200);
      const cool = await startOtp(browser(), A().slug, FIELD).expect(429);
      expect(cool.body.retryAfterSeconds).toBeGreaterThan(50);
      for (let i = 2; i <= 5; i++) {
        await redis.del(`auth:otp:cool:${subject}`);
        await startOtp(browser(), A().slug, FIELD).expect(200);
      }
      await redis.del(`auth:otp:cool:${subject}`);
      const capped = await startOtp(browser(), A().slug, FIELD).expect(429);
      expect(capped.body.retryAfterSeconds).toBeGreaterThan(3000);
      await resetLimits(A().slug, FIELD);
    });

    it('the hourly cap per client IP, whatever identifiers it tries', async () => {
      const ip = freshIp();
      for (let i = 1; i <= 20; i++) await startOtp({ ip }, A().slug, emailOf(`spray-${i}`)).expect(200);
      await startOtp({ ip }, A().slug, emailOf('spray-21')).expect(429);
      await startOtp(browser(), A().slug, emailOf('spray-21')).expect(200); // another IP is unaffected
    });

    it('the desk IP allow-list applies before anything is sent', async () => {
      await setPolicy(B().id, { ipAllowlistDesk: ['198.51.100.0/24'] });
      try {
        await startOtp(browser(), B().slug, FIELD_B).expect(200); // the unknown-organisation answer
        expect(email.send).not.toHaveBeenCalled();
        const events = await tenantPrisma.forTenant(SUPER, (tx) => tx.loginEvent.count({ where: { organizationId: B().id, reason: 'ip_not_allowed' } }));
        expect(events).toBeGreaterThan(0);
      } finally {
        await setPolicy(B().id, { ipAllowlistDesk: [] });
      }
    });

    it('rejects malformed input at the boundary', async () => {
      await post(browser(), '/auth/otp/start', { organizationSlug: A().slug, identifier: 'not an identifier' }).expect(400);
      await post(browser(), '/auth/otp/start', { organizationSlug: A().slug, identifier: FIELD, channel: 'pigeon' }).expect(400);
      await post(browser(), '/auth/otp/verify', { organizationSlug: A().slug, identifier: FIELD, otpToken: 'short', code: '123456' }).expect(400);
      await post(browser(), '/auth/otp/verify', { organizationSlug: A().slug, identifier: FIELD, otpToken: 'A'.repeat(43), code: '12345a' }).expect(400);
    });
  });

  describe('mobile number: verify it, then sign in with it by SMS or WhatsApp', () => {
    it('an unverified number signs nobody in and nothing is texted', async () => {
      const before = sms.sent.length;
      await startOtp(browser(), A().slug, mobile(1)).expect(200);
      await settle();
      expect(sms.sent.length).toBe(before);
      await resetLimits(A().slug, mobile(1));
    });

    it('the user verifies a number by a texted code; the change is audited and emailed', async () => {
      const { b, res } = await signInByCode(A().slug, MOBILE_USER);
      const access = res.body.accessToken;
      const national = `0${mobile(1).slice(3)}`; // typed as written in India
      const started = await post(b, '/auth/otp/mobile', { mobileNumber: national }, access).expect(200);
      expect(started.body).toMatchObject({ mobileNumber: mobile(1), expiresInSeconds: 300 });
      const texted = await lastSmsCode(mobile(1));
      await post(b, '/auth/otp/mobile/verify', { code: texted === '000000' ? '111111' : '000000' }, access).expect(400);
      await post(b, '/auth/otp/mobile/verify', { code: texted }, access).expect(200);
      const row = await tenantPrisma.forTenant(SUPER, (tx) => tx.user.findUniqueOrThrow({ where: { id: users[MOBILE_USER] } }));
      expect(row).toMatchObject({ mobileNumber: mobile(1), mobileVerifiedAt: expect.any(Date) });
      expect(await auditActions(A().id, 'user.mobile_verified')).toEqual([expect.objectContaining({ actorUserId: users[MOBILE_USER] })]);
      expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: MOBILE_USER, subject: 'Mobile number added to your YukthiX account' }));
      // Status shows it; user listings never do.
      const status = await request(server()).get('/api/v1/auth/mfa').set('Authorization', `Bearer ${access}`).set('X-Forwarded-For', b.ip).expect(200);
      expect(status.body.mobileNumber).toBe(mobile(1));
    });

    it('signs in by SMS and by WhatsApp to the verified number', async () => {
      const bySms = await signInByCode(A().slug, MOBILE_USER, { identifier: mobile(1) });
      expect(await session(sidOf(bySms.res.body.accessToken))).toMatchObject({ method: 'otp_sms', assuranceLevel: 'aal1' });
      const byWa = await signInByCode(A().slug, MOBILE_USER, { identifier: mobile(1), channel: 'whatsapp' });
      expect(sms.sent.at(-1)).toMatchObject({ to: mobile(1), channel: 'whatsapp' });
      // The SMS sign-in recorded the request as an authentication-only opt-in (YX-NTF-14).
      const consents = await tenantPrisma.forTenant(SUPER, (tx) => tx.channelConsent.findMany({ where: { recipientId: users[MOBILE_USER], channel: 'sms' } }));
      expect(consents).toEqual([expect.objectContaining({ scope: 'authentication_only', source: 'otp_prompt', addressMasked: expect.stringMatching(/^\+91•+\d\d$/), withdrawnAt: null })]);
      expect(await session(sidOf(byWa.res.body.accessToken))).toMatchObject({ method: 'otp_whatsapp' });
    });

    it('a number verified by one account cannot be verified by another in the same company', async () => {
      const { b, res } = await signInByCode(A().slug, FIELD);
      await post(b, '/auth/otp/mobile', { mobileNumber: mobile(1) }, res.body.accessToken).expect(200);
      await post(b, '/auth/otp/mobile/verify', { code: await lastSmsCode(mobile(1)) }, res.body.accessToken).expect(409);
    });

    it('with a factor enrolled, changing the number needs a fresh step-up (and an OTP-proven session never counts)', async () => {
      const b = browser();
      const first = await post(b, '/auth/staff/login', { organizationSlug: A().slug, email: TWO_STEP, password: PASSWORD }).expect(200);
      const sendRes = await post(b, '/auth/mfa/otp/send', { mfaToken: first.body.mfaToken, channel: 'sms' }).expect(200);
      expect(sendRes.body).toEqual({ expiresInSeconds: 300, resendAfterSeconds: 60 });
      const signedIn = await post(b, '/auth/mfa/verify', { mfaToken: first.body.mfaToken, factor: 'otp', code: await lastSmsCode(mobile(3)) }).expect(200);
      const res = await post(b, '/auth/otp/mobile', { mobileNumber: mobile(9) }, signedIn.body.accessToken).expect(403);
      expect(res.body.code).toBe(STEP_UP_REQUIRED_CODE);
      const removed = await request(server()).delete('/api/v1/auth/otp/mobile').set('Authorization', `Bearer ${signedIn.body.accessToken}`).set('X-Forwarded-For', b.ip).expect(403);
      expect(removed.body.code).toBe(STEP_UP_REQUIRED_CODE);
      await redis.del(`auth:otp:cool:${limitKey(`mfa\u0000${users[TWO_STEP]}`)}`);
    });
  });

  describe('OTP after a factor: first step by code still owes the second factor', () => {
    it('an account with TOTP that signs in by code must still give the TOTP; OTP is not offered again', async () => {
      const b = browser();
      const started = await startOtp(b, A().slug, TWO_STEP).expect(200);
      const first = await verifyOtp(b, A().slug, TWO_STEP, started.body.otpToken, lastEmailCode(TWO_STEP)!).expect(200);
      expect(first.body).toMatchObject({ mfaRequired: true, factors: ['totp', 'recovery_code'] });
      expect(first.body.accessToken).toBeUndefined();
      await post(b, '/auth/mfa/otp/send', { mfaToken: first.body.mfaToken, channel: 'sms' }).expect(400);
      const done = await post(b, '/auth/mfa/verify', { mfaToken: first.body.mfaToken, factor: 'totp', code: totp(twoStepSecret) }).expect(200);
      expect(await session(sidOf(done.body.accessToken))).toMatchObject({ method: 'otp_email', assuranceLevel: 'aal2', mfaMethod: 'totp' });
      await resetLimits(A().slug, TWO_STEP);
    });
  });

  describe('OTP as the fallback second factor (YX-IAM-03)', () => {
    it('offered after a password to a non-admin with a verified mobile; the session is AAL2 but cannot step up', async () => {
      await redis.del(`auth:otp:cool:${limitKey(`mfa\u0000${users[TWO_STEP]}`)}`);
      const { b, res: first } = await passwordLogin(A().slug, TWO_STEP);
      expect(first.body.factors).toEqual(['totp', 'recovery_code', 'otp']);
      // Never by email.
      await post(b, '/auth/mfa/otp/send', { mfaToken: first.body.mfaToken, channel: 'email' }).expect(400);
      await post(b, '/auth/mfa/otp/send', { mfaToken: first.body.mfaToken, channel: 'whatsapp' }).expect(200);
      const code = (await lastSmsCode(mobile(3)))!;
      // Wrong code: counted toward the second-step lockout and logged.
      await post(b, '/auth/mfa/verify', { mfaToken: first.body.mfaToken, factor: 'otp', code: code === '000000' ? '111111' : '000000' }).expect(401);
      expect(await events(TWO_STEP)).toEqual(expect.arrayContaining([expect.objectContaining({ result: 'mfa_failed', method: 'otp', reason: 'mfa_invalid' })]));
      const ok = await post(b, '/auth/mfa/verify', { mfaToken: first.body.mfaToken, factor: 'otp', code }).expect(200);
      const sid = sidOf(ok.body.accessToken);
      expect(await session(sid)).toMatchObject({ method: 'password', assuranceLevel: 'aal2', mfaMethod: 'otp' });
      // Replay of the same code or pending token: refused.
      await post(b, '/auth/mfa/verify', { mfaToken: first.body.mfaToken, factor: 'otp', code }).expect(401);

      const [factor] = await tenantPrisma.forTenant(SUPER, (tx) => tx.authenticator.findMany({ where: { userId: users[TWO_STEP] } }));
      const del = await request(server()).delete(`/api/v1/auth/mfa/authenticators/${factor.id}`).set('Authorization', `Bearer ${ok.body.accessToken}`).set('X-Forwarded-For', b.ip).expect(403);
      expect(del.body.code).toBe(STEP_UP_REQUIRED_CODE);
      // Step-up itself does not take a one-time code.
      await post(b, '/auth/mfa/step-up', { factor: 'otp', code }, ok.body.accessToken).expect(400);
      await redis.del(`auth:lp:acct:fail:${sha(`mfa\u0000${users[TWO_STEP]}`)}`, `auth:lp:acct:block:${sha(`mfa\u0000${users[TWO_STEP]}`)}`);
    });

    it('never for a System Admin, even with a verified mobile', async () => {
      const { b, res: first } = await passwordLogin(A().slug, ADMIN);
      expect(first.body.factors).toEqual(['totp', 'recovery_code']);
      await post(b, '/auth/mfa/otp/send', { mfaToken: first.body.mfaToken, channel: 'sms' }).expect(400);
      await post(b, '/auth/mfa/verify', { mfaToken: first.body.mfaToken, factor: 'otp', code: '123456' }).expect(401);
      await settle();
      expect(sms.sent.some((m) => m.to === mobile(4))).toBe(false);
      await redis.del(`auth:lp:acct:fail:${sha(`mfa\u0000${users[ADMIN]}`)}`, `auth:lp:acct:block:${sha(`mfa\u0000${users[ADMIN]}`)}`);
    });

    it('not where the company has not allowed OTP as a factor', async () => {
      await setPolicy(A().id, { allowedFactors: ['passkey', 'totp'] });
      try {
        const { b, res: first } = await passwordLogin(A().slug, TWO_STEP);
        expect(first.body.factors).toEqual(['totp', 'recovery_code']);
        await post(b, '/auth/mfa/otp/send', { mfaToken: first.body.mfaToken, channel: 'sms' }).expect(400);
      } finally {
        await setPolicy(A().id, { allowedFactors: ['passkey', 'totp', 'otp'] });
      }
    });

    it('the code is bound to its pending sign-in and browser', async () => {
      await redis.del(`auth:otp:cool:${limitKey(`mfa\u0000${users[TWO_STEP]}`)}`);
      const { b, res: first } = await passwordLogin(A().slug, TWO_STEP);
      const { res: other } = await passwordLogin(A().slug, TWO_STEP);
      await post({ ip: b.ip }, '/auth/mfa/otp/send', { mfaToken: first.body.mfaToken, channel: 'sms' }).expect(401); // no device cookie
      await post(b, '/auth/mfa/otp/send', { mfaToken: first.body.mfaToken, channel: 'sms' }).expect(200);
      const code = (await lastSmsCode(mobile(3)))!;
      await post(b, '/auth/mfa/verify', { mfaToken: other.body.mfaToken, factor: 'otp', code }).expect(401);
      await redis.del(`auth:otp:cool:${limitKey(`mfa\u0000${users[TWO_STEP]}`)}`);
      await redis.del(`auth:lp:acct:fail:${sha(`mfa\u0000${users[TWO_STEP]}`)}`, `auth:lp:acct:block:${sha(`mfa\u0000${users[TWO_STEP]}`)}`);
    });
  });

  describe('company policy (Settings > Security)', () => {
    it('an admin turns OTP sign-in channels on and off (step-up, audited); unknown channels are refused, also by the database', async () => {
      const { b, res: first } = await passwordLogin(A().slug, ADMIN);
      const ok = await post(b, '/auth/mfa/verify', { mfaToken: first.body.mfaToken, factor: 'totp', code: totp(adminSecret) }).expect(200);
      await markSteppedUp(tenantPrisma, ok.body.accessToken);
      const patch = (body: object) =>
        request(server()).patch('/api/v1/security/policy').set('Authorization', `Bearer ${ok.body.accessToken}`).set('X-Forwarded-For', b.ip).send(body);
      const res = await patch({ otpSignInChannels: ['email'] }).expect(200);
      expect(res.body.policy.otpSignInChannels).toEqual(['email']);
      expect(res.body.floor.otpSignInChannels).toEqual(['email', 'sms', 'whatsapp']);
      const [audit] = await auditActions(A().id, 'security_policy.updated');
      expect(JSON.parse(audit.metadataJson!).changes.otpSignInChannels).toEqual({ from: ['email', 'sms', 'whatsapp'], to: ['email'] });
      // SMS sign-in is now off for this company: nothing is sent, the reason is logged.
      const before = await tenantPrisma.forTenant(SUPER, (tx) => tx.loginEvent.count({ where: { organizationId: A().id, reason: 'otp_disabled' } }));
      await startOtp(browser(), A().slug, mobile(1)).expect(200);
      expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.loginEvent.count({ where: { organizationId: A().id, reason: 'otp_disabled' } }))).toBe(before + 1);
      await patch({ otpSignInChannels: ['carrier-pigeon'] }).expect(400);
      await expect(
        tenantPrisma.forTenant(SUPER, (tx) => tx.$executeRaw`UPDATE tenant_security_policies SET otp_sign_in_channels = ARRAY['fax']::varchar(16)[] WHERE organization_id = ${A().id}::uuid`),
      ).rejects.toThrow(/tsp_otp_sign_in_channels_check/);
      await patch({ otpSignInChannels: ['email', 'sms', 'whatsapp'] }).expect(200);
    });
  });

  describe('fails closed', () => {
    it('without its Redis store no code is issued (503), and nothing is sent', async () => {
      const down = new Redis('redis://127.0.0.1:1', { maxRetriesPerRequest: 0, lazyConnect: true, retryStrategy: () => null });
      down.on('error', () => undefined);
      const otp = new OtpService(app.get(OrgSecretsCryptoService), email as never, app.get(OTP_SMS_SENDER), down);
      await expect(otp.reserveSend('x', null)).rejects.toThrow('temporarily unavailable');
      await expect(otp.issue('k', {})).rejects.toThrow('temporarily unavailable');
      expect(email.send).not.toHaveBeenCalled();
      down.disconnect();
    });
  });
});
