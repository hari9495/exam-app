import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { createHash, randomUUID } from 'crypto';
import cookieParser from 'cookie-parser';
import Redis from 'ioredis';
import { JwtService } from '@nestjs/jwt';
import { generate } from 'selfsigned';
import { PrismaService, TenantPrismaService, invalidateTenantSecurityPolicy } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { emailArrives } from './fixtures/sms';
import { DNS_TXT_RESOLVER, IdentityProvidersService } from '../src/auth/identity-providers.service';
import { markSteppedUp } from './fixtures/step-up';

// Email-first sign-in, end to end on the real database (forced RLS, app role) and real Redis
// (founder decision 7 Oct 2026: no company-code box). One account per company (P12 §3); the
// company comes from orgSlug (unchanged), the web address, the remembered company or -- none of
// them -- from the credential itself, with a company picker only after the credential verifies.
describe('email-first sign-in without a company code (P12 §3, YX-IAM-04/07/10)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let redis: Redis;
  const jwt = new JwtService({});
  const email = { send: jest.fn().mockResolvedValue({ success: true }) };
  // A domain's TXT records, or the DNS error its look-up fails with.
  const txt = new Map<string, string[][] | Error>();
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const runId = randomUUID().slice(0, 8);
  const BASE = 'yukthix.test';
  const PERSON = `divya-${runId}@kaveri-${runId}.test`; // in Kaveri and Ashok with different passwords
  const SHARED = `meera-${runId}@kaveri-${runId}.test`; // in Kaveri, Ashok and Cauvery; same password in the first two
  const KAVERI_PW = 'Kaveri-Correct-Horse-1';
  const ASHOK_PW = 'Ashok-Correct-Horse-2';
  const SHARED_PW = 'Shared-Correct-Horse-3';
  const ADMIN_PW = 'Admin-Correct-Horse-4';
  const DOMAIN = `kaveri-${runId}.test`;
  // YukthiX platform staff with the same email and password as a company account (W-005).
  const STAFF = `ops-${runId}@yukthix-${runId}.test`;
  const STAFF_PW = 'Staff-Correct-Horse-6';
  let staffId: string;

  let planId: string;
  const org: Record<'kaveri' | 'ashok' | 'cauvery', { id: string; slug: string; name: string }> = {} as never;
  const users: Record<string, string> = {};

  let ipSeq = 0;
  const freshIp = () => `2001:db8:${runId.slice(0, 4)}:${(++ipSeq).toString(16)}::9`;
  const server = () => app.getHttpServer();
  const sha = (v: string) => createHash('sha256').update(v).digest('hex');
  const cookiesOf = (res: request.Response) => (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
  const cookieValue = (res: request.Response, name: string) => cookiesOf(res).find((c) => c.startsWith(`${name}=`))?.split(';')[0];
  const orgOf = (access: string) => (jwt.decode(access) as { organizationId: string }).organizationId;

  // A browser: one device cookie (and, once signed in, the remembered-company cookie) and one IP.
  interface Browser {
    ip: string;
    cookies: Map<string, string>;
    host?: string;
  }
  const browser = (host?: string): Browser => ({ ip: freshIp(), cookies: new Map(), host });
  async function call(b: Browser, method: 'get' | 'post' | 'delete', path: string, body?: object, headers: Record<string, string> = {}) {
    const req = request(server())[method](`/api/v1${path}`).set('X-Forwarded-For', b.ip);
    if (b.cookies.size) req.set('Cookie', [...b.cookies.values()].join('; '));
    if (b.host) req.set('Host', b.host);
    for (const [k, v] of Object.entries(headers)) req.set(k, v);
    const res = await (body ? req.send(body) : req);
    for (const c of cookiesOf(res)) {
      const pair = c.split(';')[0];
      const name = pair.slice(0, pair.indexOf('='));
      if (/Expires=Thu, 01 Jan 1970/.test(c) || pair.endsWith('=')) b.cookies.delete(name);
      else b.cookies.set(name, pair);
    }
    return res;
  }
  const login = (b: Browser, who: string, password: string, extra: object = {}) => call(b, 'post', '/auth/staff/login', { email: who, password, ...extra });
  const select = (b: Browser, selectionToken: string, organizationId: string) => call(b, 'post', '/auth/staff/select-company', { selectionToken, organizationId });

  const lockKeys = (scope: string, identifier: string) => {
    const h = sha(`${scope}\u0000${identifier}`);
    return [`auth:lp:acct:fail:${h}`, `auth:lp:acct:block:${h}`];
  };
  // Clears an identifier's counters (each limit is proven on its own below).
  const platformLogin = (b: Browser, who: string, password: string) => call(b, 'post', '/auth/platform/login', { email: who, password });
  const resetLocks = async (identifier: string) => {
    const keys = ['*', '', ...Object.values(org).map((o) => o.slug.toLowerCase())].flatMap((s) => lockKeys(s, identifier));
    await redis.del(...keys);
  };
  const events = (where: object) => tenantPrisma.forTenant(SUPER, (tx) => tx.loginEvent.findMany({ where, orderBy: { createdAt: 'desc' } }));
  const setPolicy = async (organizationId: string, data: object) => {
    await tenantPrisma.forTenant(SUPER, (tx) => tx.tenantSecurityPolicy.upsert({ where: { organizationId }, create: { organizationId, ...data }, update: data }));
    invalidateTenantSecurityPolicy(organizationId);
  };

  beforeAll(async () => {
    process.env.YX_BASE_DOMAIN = BASE;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue(email)
      .overrideProvider(DNS_TXT_RESOLVER)
      .useValue(async (name: string) => {
        const answer = txt.get(name);
        if (answer instanceof Error) throw answer;
        return answer ?? [];
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.getHttpAdapter().getInstance().set('trust proxy', true);
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');

    planId = (await prisma.plan.create({ data: { name: `email-first-${runId}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const [key, name] of [['kaveri', 'Kaveri Foods'], ['ashok', 'Ashok Textiles'], ['cauvery', 'Cauvery Mills']] as const) {
      const row = await prisma.organization.create({ data: { name: `${name} ${runId}`, slug: `${key}-${runId}`, planId } });
      org[key] = { id: row.id, slug: row.slug, name: row.name };
    }
    const seed: [keyof typeof org, string, string, string][] = [
      ['kaveri', PERSON, KAVERI_PW, 'panel'],
      ['ashok', PERSON, ASHOK_PW, 'panel'],
      ['kaveri', SHARED, SHARED_PW, 'panel'],
      ['ashok', SHARED, SHARED_PW, 'panel'],
      ['cauvery', SHARED, 'Cauvery-Other-Horse-5', 'panel'],
      ['kaveri', `admin-${runId}@kaveri-${runId}.test`, ADMIN_PW, 'org_admin'],
    ];
    for (const [key, who, password, role] of seed) {
      const organizationId = org[key].id;
      const passwordHash = await argon2.hash(password);
      users[`${key}:${who}`] = (await tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId, email: who, passwordHash, role } }))).id;
    }
    const staffHash = await argon2.hash(STAFF_PW);
    staffId = (await tenantPrisma.forTenant(SUPER, (tx) => tx.user.create({ data: { organizationId: null, email: STAFF, passwordHash: staffHash, role: 'super_admin' } }))).id;
  });

  beforeEach(async () => {
    email.send.mockClear();
    await resetLocks(PERSON);
    await resetLocks(SHARED);
    await resetLocks(STAFF);
  });

  afterAll(async () => {
    delete process.env.YX_BASE_DOMAIN;
    const ids = Object.values(org).map((o) => o.id);
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        await tx.refreshToken.deleteMany({ where: { user: { organizationId: { in: ids } } } });
        await tx.refreshToken.deleteMany({ where: { userId: staffId } });
        await tx.user.deleteMany({ where: { id: staffId } });
        await tx.user.deleteMany({ where: { organizationId: { in: ids } } });
        await tx.tenantSecurityPolicy.deleteMany({ where: { organizationId: { in: ids } } });
        await tx.identityProvider.deleteMany({ where: { organizationId: { in: ids } } });
        await tx.verifiedDomain.deleteMany({ where: { organizationId: { in: ids } } });
      })
      .catch(() => undefined);
    await tenantPrisma.forTenant(SUPER, (tx) => tx.organization.deleteMany({ where: { id: { in: ids } } })).catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    redis.disconnect();
    await app.close();
  });

  describe('password, no company named', () => {
    it('the same email in two companies with different passwords: each password signs in to its own company', async () => {
      const kaveri = await login(browser(), PERSON, KAVERI_PW);
      expect(kaveri.status).toBe(200);
      expect(orgOf(kaveri.body.accessToken)).toBe(org.kaveri.id);
      const ashok = await login(browser(), PERSON.toUpperCase(), ASHOK_PW);
      expect(ashok.status).toBe(200);
      expect(orgOf(ashok.body.accessToken)).toBe(org.ashok.id);
      // Signing in to one company is no failed attempt on the other.
      expect(await events({ userId: users[`kaveri:${PERSON}`], result: 'failed' })).toEqual([]);
    });

    it('a wrong password answers exactly like an unknown email, never lists companies, and is logged per company', async () => {
      const wrong = await login(browser(), PERSON, 'Not-The-Password-9');
      const unknown = await login(browser(), `nobody-${runId}@kaveri-${runId}.test`, 'Not-The-Password-9');
      expect(wrong.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect(wrong.body).toEqual(unknown.body);
      expect(JSON.stringify(wrong.body)).not.toMatch(/Kaveri|Ashok|companies|selection/);
      expect(cookieValue(wrong, 'refresh_token')).toBeUndefined();
      const [kaveriEvent] = await events({ userId: users[`kaveri:${PERSON}`] });
      expect(kaveriEvent).toMatchObject({ organizationId: org.kaveri.id, result: 'failed', reason: 'bad_password', method: 'password' });
    });

    it('timing: an unknown email costs about as much as a known one with a wrong password', async () => {
      const time = async (who: string) => {
        const started = process.hrtime.bigint();
        await login(browser(), who, 'Not-The-Password-9');
        return Number(process.hrtime.bigint() - started) / 1e6;
      };
      const known: number[] = [];
      const unknown: number[] = [];
      for (let i = 0; i < 3; i++) {
        known.push(await time(PERSON));
        unknown.push(await time(`ghost-${i}-${runId}@kaveri-${runId}.test`));
        await resetLocks(PERSON);
      }
      const median = (xs: number[]) => xs.sort((a, b) => a - b)[1];
      // Both pay an argon2 verify; generous bounds keep this a guard, not a flake.
      expect(median(unknown) / median(known)).toBeGreaterThan(0.33);
      expect(median(unknown) / median(known)).toBeLessThan(3);
    });

    it('the same password in two companies: a picker, only after the credential verified, then that company', async () => {
      const b = browser();
      const res = await login(b, SHARED, SHARED_PW);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        selectionRequired: true,
        selectionToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
        companies: expect.arrayContaining([
          { id: org.kaveri.id, name: org.kaveri.name, logoUrl: null },
          { id: org.ashok.id, name: org.ashok.name, logoUrl: null },
        ]),
        expiresInSeconds: 120,
      });
      expect(res.body.companies).toHaveLength(2); // not Cauvery: its password is different
      expect(cookieValue(res, 'refresh_token')).toBeUndefined();

      const signedIn = await select(b, res.body.selectionToken, org.ashok.id);
      expect(signedIn.status).toBe(200);
      expect(orgOf(signedIn.body.accessToken)).toBe(org.ashok.id);
      expect(cookieValue(signedIn, 'refresh_token')).toMatch(/^refresh_token=/);

      // Single use.
      expect((await select(b, res.body.selectionToken, org.kaveri.id)).status).toBe(401);
    });

    it('the selection token is bound to the device, cannot pick a company the credential did not match, and expires', async () => {
      const pick = async (b: Browser) => (await login(b, SHARED, SHARED_PW)).body.selectionToken as string;

      const mine = browser();
      const token = await pick(mine);
      const thief = browser();
      expect((await select(thief, token, org.kaveri.id)).status).toBe(401);
      // ...and the attempt spent it.
      expect((await select(mine, token, org.kaveri.id)).status).toBe(401);

      const b = browser();
      const notMatched = await select(b, await pick(b), org.cauvery.id);
      expect(notMatched.status).toBe(401);
      expect(notMatched.body.accessToken).toBeUndefined();

      const c = browser();
      const expiring = await pick(c);
      await redis.pexpire(`auth:pick:${sha(expiring)}`, 1);
      await new Promise((r) => setTimeout(r, 20));
      expect((await select(c, expiring, org.kaveri.id)).status).toBe(401);
      const [event] = await events({ identifier: null, reason: 'company_pick_invalid' });
      expect(event).toBeDefined();
    });

    it('a wrong password with the shared email never shows the list', async () => {
      const res = await login(browser(), SHARED, 'Not-The-Password-9');
      expect(res.status).toBe(401);
      expect(res.body.companies).toBeUndefined();
    });
  });

  // W-005: platform staff never sign in through a company -- not by password, code, picker or reset.
  describe('YukthiX platform staff are never reachable through the company sign-in (W-005)', () => {
    beforeAll(async () => {
      // The same email in a company, with the same password as the staff account.
      const organizationId = org.cauvery.id;
      const passwordHash = await argon2.hash(STAFF_PW);
      users['cauvery:staff-twin'] = (await tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId, email: STAFF, passwordHash, role: 'panel' } }))).id;
    });

    it('staff email + right password on the company path: the company account only, never a "YukthiX" choice', async () => {
      const res = await login(browser(), STAFF, STAFF_PW);
      expect(res.status).toBe(200);
      expect(res.body.selectionRequired).toBeUndefined();
      expect(orgOf(res.body.accessToken)).toBe(org.cauvery.id);
    });

    it('with no company account, it is exactly the wrong-password 401, and nothing is counted against the staff account', async () => {
      await tenantPrisma.forTenant({ organizationId: org.cauvery.id, isSuperAdmin: false }, (tx) => tx.user.update({ where: { id: users['cauvery:staff-twin'] }, data: { status: 'inactive' } }));
      try {
        const right = await login(browser(), STAFF, STAFF_PW);
        const wrong = await login(browser(), STAFF, 'not-the-password');
        expect(right.status).toBe(401);
        expect(right.body).toEqual(wrong.body);
        const unknown = await login(browser(), `nobody-${runId}@yukthix-${runId}.test`, STAFF_PW);
        expect(unknown.body).toEqual(right.body);
        expect(await events({ userId: staffId })).toEqual([]);
        expect(await redis.exists(...lockKeys('', STAFF))).toBe(0);
      } finally {
        await tenantPrisma.forTenant({ organizationId: org.cauvery.id, isSuperAdmin: false }, (tx) => tx.user.update({ where: { id: users['cauvery:staff-twin'] }, data: { status: 'active' } }));
      }
    });

    it('the company picker never lists YukthiX, and a "yukthix" choice is refused', async () => {
      // A second company account with the same password: the picker appears, with companies only.
      const organizationId = org.ashok.id;
      const passwordHash = await argon2.hash(STAFF_PW);
      const twin = (await tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId, email: STAFF, passwordHash, role: 'panel' } }))).id;
      try {
        const b = browser();
        const res = await login(b, STAFF, STAFF_PW);
        expect(res.body.selectionRequired).toBe(true);
        expect(res.body.companies.map((c: { id: string }) => c.id).sort()).toEqual([org.ashok.id, org.cauvery.id].sort());
        expect(res.body.companies.map((c: { name: string }) => c.name)).not.toContain('YukthiX');
        expect((await select(b, res.body.selectionToken, 'yukthix')).status).toBe(400);
      } finally {
        await tenantPrisma.forTenant(SUPER, (tx) => tx.user.delete({ where: { id: twin } }));
      }
    });

    it('one-time codes and forgot-password do not reach the staff account', async () => {
      await setPolicy(org.cauvery.id, { otpSignInChannels: ['email'] });
      try {
        expect((await call(browser(), 'post', '/auth/otp/start', { identifier: STAFF })).status).toBe(200);
        expect((await call(browser(), 'post', '/auth/forgot-password', { email: STAFF })).status).toBe(200);
        // The code and the reset link went to the company account only.
        expect(await events({ userId: users['cauvery:staff-twin'], result: 'code_sent' })).toHaveLength(1);
        expect(await events({ userId: staffId })).toEqual([]);
        expect(await prisma.passwordResetToken.count({ where: { userId: users['cauvery:staff-twin'] } })).toBe(1);
        expect(await prisma.passwordResetToken.count({ where: { userId: staffId } })).toBe(0);
      } finally {
        await setPolicy(org.cauvery.id, { otpSignInChannels: [] });
      }
    });

    it('a typed company code still gets the YukthiX reset page link', async () => {
      email.send.mockClear();
      expect((await call(browser(), 'post', '/auth/forgot-password', { organizationSlug: org.cauvery.slug, email: STAFF })).status).toBe(200);
      await emailArrives(email.send, (m) => m.to === STAFF);
      const html = email.send.mock.calls.find(([m]) => m.to === STAFF)![0].html as string;
      expect(html).toMatch(/\/yx\/reset-password\/[0-9a-f]{64}/);
      expect(html).not.toMatch(/(?<!\/yx)\/reset-password\//);
    });

    it('YukthiX staff are offered a security key only when setting up their second step', async () => {
      const res = await platformLogin(browser(), STAFF, STAFF_PW);
      const status = await request(server()).get('/api/v1/auth/mfa').set('Authorization', `Bearer ${res.body.accessToken}`).set('X-Forwarded-For', freshIp()).expect(200);
      expect(status.body.allowedFactors).toEqual(['passkey']);
    });

    it('the platform staff sign-in still works, and never signs in a company account', async () => {
      const res = await platformLogin(browser(), STAFF.toUpperCase(), STAFF_PW);
      expect(res.status).toBe(200);
      const payload = jwt.decode(res.body.accessToken) as { sub: string; role: string; organizationId: string | null };
      expect(payload).toMatchObject({ sub: staffId, role: 'super_admin', organizationId: null });
      // A company account's credential is just a wrong credential here.
      const company = await platformLogin(browser(), PERSON, KAVERI_PW);
      expect(company.status).toBe(401);
      expect(company.body).toEqual((await platformLogin(browser(), STAFF, 'not-the-password')).body);
    });
  });

  describe('lockout (YX-IAM-07): per account under its company\'s settings, per email across companies, per IP', () => {
    it('a company\'s stricter lockout locks its account; the other company\'s account still signs in', async () => {
      await setPolicy(org.ashok.id, { maxFailedAttempts: 3, lockMinutes: 15 });
      for (let i = 0; i < 3; i++) {
        expect((await login(browser(), PERSON, `Wrong-Password-${i}x`)).status).toBe(401);
      }
      // The email-wide counter and Kaveri's own (default 10) only reached the progressive delay; clear
      // those to look at Ashok's lock alone.
      await redis.del(...lockKeys('*', PERSON), ...lockKeys(org.kaveri.slug, PERSON));
      // Ashok's account is locked: its right password does not open it, by email-first or by orgSlug.
      expect((await login(browser(), PERSON, ASHOK_PW)).status).toBe(401);
      expect((await login(browser(), PERSON, ASHOK_PW, { organizationSlug: org.ashok.slug })).status).toBe(429);
      expect(await events({ userId: users[`ashok:${PERSON}`], reason: 'bad_password+lockout_started' })).toHaveLength(1);
      // Kaveri's account is not.
      await redis.del(...lockKeys('*', PERSON));
      expect((await login(browser(), PERSON, KAVERI_PW)).status).toBe(200);
      await setPolicy(org.ashok.id, { maxFailedAttempts: 10, lockMinutes: 15 });
    });

    it('the email is counted across companies before anything is checked: the delay holds from any IP and device', async () => {
      for (let i = 0; i < 3; i++) await login(browser(), PERSON, `Wrong-Password-${i}y`);
      const res = await login(browser(), PERSON, KAVERI_PW);
      expect(res.status).toBe(429);
      expect(res.body.retryAfterSeconds).toBeGreaterThan(0);
    });
  });

  describe('company from the web address (YX_BASE_DOMAIN)', () => {
    it('<slug>.<base> scopes the sign-in to that company, as an orgSlug would', async () => {
      const onKaveri = browser(`${org.kaveri.slug}.${BASE}`);
      expect((await login(onKaveri, PERSON, ASHOK_PW)).status).toBe(401);
      const ok = await login(browser(`${org.kaveri.slug}.${BASE}`), PERSON, KAVERI_PW);
      expect(orgOf(ok.body.accessToken)).toBe(org.kaveri.id);
      // ...and the shared email there signs straight in, no picker.
      const shared = await login(browser(`${org.ashok.slug}.${BASE}`), SHARED, SHARED_PW);
      expect(orgOf(shared.body.accessToken)).toBe(org.ashok.id);
    });

    it('a spoofed Host or X-Forwarded-Host is ignored unless it matches the base domain', async () => {
      // Foreign host: email-first, so Ashok's password still works.
      const foreign = await login(browser(`${org.kaveri.slug}.evil.test`), PERSON, ASHOK_PW);
      expect(orgOf(foreign.body.accessToken)).toBe(org.ashok.id);
      // X-Forwarded-Host is never read.
      const b = browser();
      const forwarded = await call(b, 'post', '/auth/staff/login', { email: PERSON, password: ASHOK_PW }, { 'X-Forwarded-Host': `${org.kaveri.slug}.${BASE}` });
      expect(orgOf(forwarded.body.accessToken)).toBe(org.ashok.id);
      // The Origin of a company address scopes like the Host.
      const fromOrigin = await call(browser(), 'post', '/auth/staff/login', { email: PERSON, password: ASHOK_PW }, { Origin: `https://${org.kaveri.slug}.${BASE}` });
      expect(fromOrigin.status).toBe(401);
    });
  });

  describe('remembered company on this device', () => {
    it('a sign-in remembers the company; the public endpoint shows its name and logo only; it scopes the next sign-in', async () => {
      const b = browser();
      expect((await login(b, PERSON, KAVERI_PW)).status).toBe(200);
      expect(b.cookies.get('yx_company')).toMatch(new RegExp(`^yx_company=${org.kaveri.id}\\.[0-9a-f]{64}$`));
      const shown = await call(b, 'get', '/auth/remembered-company');
      expect(shown.body).toEqual({ company: { name: org.kaveri.name, logoUrl: null } });
      // Scoped: Ashok's password is wrong here.
      expect((await login(b, PERSON, ASHOK_PW)).status).toBe(401);

      // "Not your company?" forgets it: email-first again.
      expect((await call(b, 'delete', '/auth/remembered-company')).status).toBe(204);
      expect(b.cookies.has('yx_company')).toBe(false);
      expect((await call(b, 'get', '/auth/remembered-company')).body).toEqual({ company: null });
      expect(orgOf((await login(b, PERSON, ASHOK_PW)).body.accessToken)).toBe(org.ashok.id);
    });

    it('a tampered cookie is rejected and cleared, and does not scope the sign-in', async () => {
      const b = browser();
      await login(b, PERSON, KAVERI_PW);
      const [, mac] = b.cookies.get('yx_company')!.split('.');
      b.cookies.set('yx_company', `yx_company=${org.ashok.id}.${mac}`);
      const res = await call(b, 'get', '/auth/remembered-company');
      expect(res.body).toEqual({ company: null });
      expect(cookiesOf(res).some((c) => c.startsWith('yx_company=;'))).toBe(true);

      const forged = browser();
      forged.cookies.set('yx_company', `yx_company=${org.ashok.id}.${'0'.repeat(64)}`);
      // Not scoped to Ashok: Kaveri's password still signs in to Kaveri.
      expect(orgOf((await login(forged, PERSON, KAVERI_PW)).body.accessToken)).toBe(org.kaveri.id);
    });
  });

  describe('orgSlug (exam / ATS clients, deep links): unchanged', () => {
    it('signs in to the named company only', async () => {
      const ok = await login(browser(), SHARED, SHARED_PW, { organizationSlug: org.kaveri.slug });
      expect(orgOf(ok.body.accessToken)).toBe(org.kaveri.id);
      expect((await login(browser(), PERSON, ASHOK_PW, { organizationSlug: org.kaveri.slug })).status).toBe(401);
      expect((await login(browser(), PERSON, KAVERI_PW, { organizationSlug: `no-such-${runId}` })).status).toBe(401);
    });
  });

  describe('one-time code, no company named', () => {
    beforeAll(async () => {
      for (const o of [org.kaveri, org.ashok]) await setPolicy(o.id, { otpSignInChannels: ['email'] });
    });
    afterAll(async () => {
      for (const o of [org.kaveri, org.ashok]) await setPolicy(o.id, { otpSignInChannels: [] });
    });
    const lastCode = (to: string) => [...email.send.mock.calls].reverse().find(([m]) => m.to === to && /code/.test(m.subject))?.[0].subject.match(/^(\d{6}) is your/)?.[1];

    it('one code to the address however many companies use it; once verified, the picker', async () => {
      const b = browser();
      const started = await call(b, 'post', '/auth/otp/start', { identifier: SHARED });
      expect(started.status).toBe(200);
      await emailArrives(email.send, (m) => m.to === SHARED);
      expect(email.send.mock.calls.filter(([m]) => m.to === SHARED)).toHaveLength(1);
      // Several companies use the address: the email names none of them.
      expect(email.send.mock.calls.find(([m]) => m.to === SHARED)![0].text).toContain('Enter this code to sign in to YukthiX.');
      const verified = await call(b, 'post', '/auth/otp/verify', { identifier: SHARED, otpToken: started.body.otpToken, code: lastCode(SHARED) });
      expect(verified.body.selectionRequired).toBe(true);
      // Cauvery has codes off: it is not offered.
      expect(verified.body.companies.map((c: { id: string }) => c.id).sort()).toEqual([org.kaveri.id, org.ashok.id].sort());
      const signedIn = await select(b, verified.body.selectionToken, org.kaveri.id);
      expect(orgOf(signedIn.body.accessToken)).toBe(org.kaveri.id);
      await redis.del(`auth:otp:cool:${sha(`signin\u0000\u0000${SHARED}`)}`);
    });

    it('an unknown address gets the same answer and nothing is sent', async () => {
      const ghost = `ghost-${runId}@kaveri-${runId}.test`;
      const res = await call(browser(), 'post', '/auth/otp/start', { identifier: ghost });
      expect(res.status).toBe(200);
      expect(Object.keys(res.body).sort()).toEqual(['expiresInSeconds', 'otpToken', 'resendAfterSeconds']);
      await new Promise((r) => setTimeout(r, 200));
      expect(email.send).not.toHaveBeenCalled();
    });
  });

  describe('single sign-on by email domain', () => {
    let adminAccess: string;
    const admin = (method: 'get' | 'post' | 'patch', path: string) =>
      request(server())[method](`/api/v1/security/identity-providers${path}`).set('Authorization', `Bearer ${adminAccess}`);
    const identify = (b: Browser, identifier: string) => call(b, 'post', '/auth/identify', { identifier });

    beforeAll(async () => {
      process.env.API_ORIGIN ??= 'http://localhost:3001';
      adminAccess = (await login(browser(), `admin-${runId}@kaveri-${runId}.test`, ADMIN_PW)).body.accessToken;
      await markSteppedUp(tenantPrisma, adminAccess);
      const cert = (await generate([{ name: 'commonName', value: 'idp.test' }])).cert;
      await admin('post', '')
        .send({ type: 'saml', name: 'Kaveri Okta', status: 'active', samlEntityId: 'kaveri-okta', samlSsoUrl: 'https://okta.example.com/sso', samlCertificate: cert, domains: [DOMAIN] })
        .expect(201);
    });

    it('a public mail domain can never be mapped or verified', async () => {
      const res = await admin('post', '').send({ type: 'saml', name: 'Gmail', domains: ['gmail.com'] });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/public email domain/);
      expect((await admin('post', '/domains/verify').send({ domain: 'gmail.com' })).status).toBe(400);
      // ...and an @gmail.com address never routes anywhere.
      expect((await identify(browser(), `someone-${runId}@gmail.com`)).body).toEqual({ next: 'password', providers: [] });
    });

    it('an unverified domain does not route; once its TXT record is found, it goes straight to the identity provider', async () => {
      expect((await identify(browser(), PERSON)).body).toEqual({ next: 'password', providers: [] });

      const [row] = (await admin('get', '/domains').expect(200)).body;
      expect(row).toEqual({ domain: DOMAIN, verifiedAt: null, lapsedAt: null, txtRecord: { name: DOMAIN, value: expect.stringMatching(/^yukthix-domain-verification=/) } });
      // Not published yet.
      expect((await admin('post', '/domains/verify').send({ domain: DOMAIN })).status).toBe(400);
      txt.set(DOMAIN, [['v=spf1 -all'], [row.txtRecord.value]]);
      expect((await admin('post', '/domains/verify').send({ domain: DOMAIN })).status).toBe(200);

      const routed = await identify(browser(), PERSON);
      expect(routed.body).toEqual({ next: 'sso', url: expect.stringContaining(`/auth/saml/${encodeURIComponent(org.kaveri.slug)}/login?RelayState=`) });
      // The same answer for an address at the domain that has no account: the domain uses SSO, nothing more.
      expect((await identify(browser(), `nobody-${runId}@${DOMAIN}`)).body.next).toBe('sso');
    });

    it('a domain two companies have verified does not auto-route', async () => {
      await tenantPrisma.forTenant(SUPER, (tx) => tx.verifiedDomain.create({ data: { organizationId: org.ashok.id, domain: DOMAIN } }));
      expect((await identify(browser(), PERSON)).body).toEqual({ next: 'password', providers: [] });
      await tenantPrisma.forTenant(SUPER, (tx) => tx.verifiedDomain.delete({ where: { organizationId_domain: { organizationId: org.ashok.id, domain: DOMAIN } } }));
    });

    // W-006: the scheduled re-check (the 'domain-verification-recheck' sweep runs recheckDomains).
    it('a domain whose TXT record is removed stops routing after 3 real misses (not transient errors); re-verifying restores it', async () => {
      const recheck = () => app.get(IdentityProvidersService).recheckDomains();
      const routes = async () => (await identify(browser(), PERSON)).body.next === 'sso';
      const record = (await admin('get', '/domains').expect(200)).body[0].txtRecord.value as string;
      expect(await routes()).toBe(true);

      txt.set(DOMAIN, [['v=spf1 -all']]); // the record is gone
      await recheck();
      txt.set(DOMAIN, Object.assign(new Error(`queryTxt ETIMEOUT ${DOMAIN}`), { code: 'ETIMEOUT' }));
      await recheck(); // transient: does not count
      txt.set(DOMAIN, Object.assign(new Error(`queryTxt ENODATA ${DOMAIN}`), { code: 'ENODATA' }));
      await recheck();
      expect(await routes()).toBe(true);
      const counted = await tenantPrisma.forTenant(SUPER, (tx) => tx.verifiedDomain.findUnique({ where: { organizationId_domain: { organizationId: org.kaveri.id, domain: DOMAIN } } }));
      expect(counted).toMatchObject({ failedChecks: 2, lapsedAt: null, lastCheckedAt: expect.any(Date) });

      email.send.mockClear();
      txt.set(DOMAIN, []);
      await recheck();
      expect(await routes()).toBe(false);
      const [lapsed] = (await admin('get', '/domains').expect(200)).body;
      expect(lapsed).toEqual({ domain: DOMAIN, verifiedAt: null, lapsedAt: expect.any(String), txtRecord: { name: DOMAIN, value: record } });
      const audit = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findFirst({ where: { organizationId: org.kaveri.id, action: 'identity_provider.domain_lapsed' } }));
      expect(audit?.actorUserId).toBeNull();
      expect(JSON.parse(audit!.metadataJson!)).toEqual({ domain: DOMAIN, failedChecks: 3 });
      await emailArrives(email.send, (m) => m.to === `admin-${runId}@kaveri-${runId}.test` && /lapsed/.test(m.subject));
      expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: `admin-${runId}@kaveri-${runId}.test`, subject: expect.stringContaining('lapsed') }));
      // A lapsed domain is not re-checked on its own: the admin restores it.
      await recheck();
      expect(await routes()).toBe(false);

      txt.set(DOMAIN, [[record]]);
      expect((await admin('post', '/domains/verify').send({ domain: DOMAIN })).status).toBe(200);
      expect(await routes()).toBe(true);
      expect((await admin('get', '/domains').expect(200)).body[0]).toMatchObject({ verifiedAt: expect.any(String), lapsedAt: null });
      expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.verifiedDomain.findUnique({ where: { organizationId_domain: { organizationId: org.kaveri.id, domain: DOMAIN } } }))).toMatchObject({ failedChecks: 0, lapsedAt: null });
    });

    it('with the company known, its own providers are offered (and its domains route as before)', async () => {
      const res = await identify(browser(`${org.kaveri.slug}.${BASE}`), `someone-${runId}@other.test`);
      expect(res.body).toEqual({ next: 'password', providers: [{ id: expect.any(String), name: 'Kaveri Okta', type: 'saml' }] });
      expect((await identify(browser(`${org.ashok.slug}.${BASE}`), PERSON)).body).toEqual({ next: 'password', providers: [] });
    });
  });
});
