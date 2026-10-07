import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import cookieParser from 'cookie-parser';
import { JwtService } from '@nestjs/jwt';
import { OrgSecretsCryptoService, PrismaService, TenantPrismaService, invalidateTenantSecurityPolicy } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { MICROSOFT_CONSUMER_TENANT } from '../src/auth/social-sign-in';
import { markSteppedUp } from './fixtures/step-up';
import { MockIdp } from './fixtures/mock-idp';

// "Continue with Google / Microsoft" end to end (founder request 7 Oct 2026; P12 Q2): YukthiX's
// platform OIDC apps through openid-client against the local mock identity provider (oidc-provider,
// the same one the founder runs with `npm run dev:mock-idp`), on the real database (forced RLS,
// app role) and real Redis. No Google / Microsoft call is ever made.
describe('Continue with Google / Microsoft (P12 Q2)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let prisma: PrismaService;
  const idp = new MockIdp();
  const jwt = new JwtService({});
  const email = { send: jest.fn().mockResolvedValue({ success: true }) };
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const runId = randomUUID().slice(0, 8);
  const DOMAIN = `kaveri-${runId}.test`;
  const at = (name: string) => `${name}@${DOMAIN}`;
  const BASE = `yx-${runId}.test`;
  const WORK_TENANT = randomUUID();
  const OTHER_TENANT = randomUUID();
  const saved = { mock: process.env.YX_MOCK_IDP_URL, base: process.env.YX_BASE_DOMAIN };

  let planId: string;
  const orgs: Record<'a' | 'b' | 'off' | 'ssoOnly', { id: string; slug: string }> = {} as never;
  const users: Record<string, string> = {};

  const server = () => app.getHttpServer();
  const device = (c: string) => `yx_device=${c.repeat(43)}`;
  const ctx = (organizationId: string) => ({ organizationId, isSuperAdmin: false });
  const lastEvent = (method: 'google' | 'microsoft', organizationId: string | null = null) =>
    tenantPrisma.forTenant(SUPER, (tx) => tx.loginEvent.findFirst({ where: { method, organizationId }, orderBy: { createdAt: 'desc' } }));
  const links = (userId: string) => tenantPrisma.forTenant(SUPER, (tx) => tx.externalIdentity.findMany({ where: { userId } }));
  const google = (sub: string, mail: string, verified = true) => ({ sub, email: mail, email_verified: verified, name: 'Test Person' });
  const microsoft = (oid: string, claims: Record<string, unknown>) => ({ sub: `pairwise-${oid}`, tid: WORK_TENANT, oid, name: 'Test Person', ...claims });

  const start = (provider: string, cookie = device('a'), host?: string) => {
    const req = request(server()).post(`/api/v1/auth/social/${provider}/start`).set('Cookie', cookie);
    return host ? req.set('Host', host) : req;
  };
  const fragment = (location: string) => new URLSearchParams(new URL(location).hash.slice(1));
  // Start -> the provider -> the callback. Returns the callback's redirect target.
  async function callback(provider: 'google' | 'microsoft', person: string | Record<string, unknown>, opts: { cookie?: string; back?: string; nonce?: string } = {}) {
    const started = await start(provider, opts.cookie ?? device('a')).expect(200);
    const back = await idp.signIn(started.body.url, person, { nonce: opts.nonce });
    const res = await request(server()).get(back).set('Cookie', opts.back ?? opts.cookie ?? device('a'));
    expect(res.status).toBe(302);
    return { location: res.headers.location as string, back, url: started.body.url as string };
  }
  const exchange = (code: string | null, cookie = device('a')) => request(server()).post('/api/v1/auth/social/exchange').set('Cookie', cookie).send({ code });
  // The whole round trip, then the exchange: `await signIn(...).expect(200)`.
  const signIn = (provider: 'google' | 'microsoft', person: string | Record<string, unknown>, cookie = device('a')) => ({
    expect: async (status: number) => {
      const { location } = await callback(provider, person, { cookie });
      const code = fragment(location).get('code');
      expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
      return exchange(code, cookie).expect(status);
    },
  });
  const auditMeta = (row: { metadataJson: string | null } | null) => (row?.metadataJson ? JSON.parse(row.metadataJson) : null);
  const setPolicy = async (orgId: string, data: Record<string, unknown>) => {
    await tenantPrisma.forTenant(ctx(orgId), (tx) =>
      tx.tenantSecurityPolicy.upsert({ where: { organizationId: orgId }, update: data, create: { organizationId: orgId, ...data } }),
    );
    invalidateTenantSecurityPolicy(orgId);
  };
  const createUser = async (who: string, org: { id: string } | null, role = 'recruiter') =>
    (users[`${who}:${org?.id ?? 'staff'}`] = (
      await tenantPrisma.forTenant(org ? ctx(org.id) : SUPER, async (tx) =>
        tx.user.create({ data: { organizationId: org?.id ?? null, email: who, passwordHash: await argon2.hash(PASSWORD), role } }),
      )
    ).id);

  beforeAll(async () => {
    process.env.API_ORIGIN ??= 'http://localhost:3001';
    await idp.start(process.env.API_ORIGIN);
    process.env.YX_MOCK_IDP_URL = idp.url;
    process.env.YX_BASE_DOMAIN = BASE;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue(email).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    planId = (await prisma.plan.create({ data: { name: `social-plan-${runId}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const key of ['a', 'b', 'off', 'ssoOnly'] as const) {
      orgs[key] = await prisma.organization.create({ data: { name: `Social ${key}`, slug: `social-${key.toLowerCase()}-${runId}`, planId }, select: { id: true, slug: true } });
    }
    await setPolicy(orgs.a.id, { googleSignIn: true, microsoftSignIn: true, otpSignInChannels: ['email'] });
    await setPolicy(orgs.b.id, { googleSignIn: true, microsoftSignIn: true });
    await setPolicy(orgs.off.id, { googleSignIn: false, microsoftSignIn: false });

    await createUser(at('ana'), orgs.a);
    await createUser(at('both'), orgs.a);
    await createUser(at('both'), orgs.b);
    await createUser(at('fac'), orgs.a);
    await createUser(at('admin'), orgs.a, 'org_admin');
    await createUser(at('offer'), orgs.off);
    await createUser(at('sso'), orgs.ssoOnly);
    await createUser(at('dom'), orgs.a);
    await createUser(at('dom'), orgs.b);
    await createUser(at('linked'), orgs.a);
    await createUser(at('staff'), null, 'super_admin');
    // SSO-only needs an active provider and two break-glass admins; written straight to the table.
    const breakGlassUserIds = [await createUser(at('bg1'), orgs.ssoOnly, 'org_admin'), await createUser(at('bg2'), orgs.ssoOnly, 'org_admin')];
    await setPolicy(orgs.ssoOnly.id, { googleSignIn: true, microsoftSignIn: true, ssoOnly: true, breakGlassUserIds });
    // A second factor for fac (the enrolment flow is proven in mfa.e2e).
    const secretEncrypted = app.get(OrgSecretsCryptoService).encrypt('JBSWY3DPEHPK3PXP');
    await tenantPrisma.forTenant(SUPER, (tx) =>
      tx.authenticator.create({ data: { organizationId: orgs.a.id, userId: users[`${at('fac')}:${orgs.a.id}`], type: 'totp', label: 'Phone', secretEncrypted } }),
    );
    // Company A has proven it owns DOMAIN; company B has not.
    await tenantPrisma.forTenant(ctx(orgs.a.id), (tx) => tx.verifiedDomain.create({ data: { organizationId: orgs.a.id, domain: DOMAIN } }));
  });

  afterAll(async () => {
    const ids = Object.values(orgs).map((o) => o.id);
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        await tx.externalIdentity.deleteMany({ where: { organizationId: { in: ids } } });
        await tx.refreshToken.deleteMany({ where: { user: { organizationId: { in: ids } } } });
        await tx.session.deleteMany({ where: { organizationId: { in: ids } } });
        await tx.authenticator.deleteMany({ where: { organizationId: { in: ids } } });
        await tx.verifiedDomain.deleteMany({ where: { organizationId: { in: ids } } });
        await tx.user.deleteMany({ where: { OR: [{ organizationId: { in: ids } }, { email: at('staff') }] } });
        await tx.tenantSecurityPolicy.deleteMany({ where: { organizationId: { in: ids } } });
        await tx.organization.deleteMany({ where: { id: { in: ids } } });
      })
      .catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
    idp.stop();
    process.env.YX_MOCK_IDP_URL = saved.mock;
    process.env.YX_BASE_DOMAIN = saved.base;
    if (saved.mock === undefined) delete process.env.YX_MOCK_IDP_URL;
    if (saved.base === undefined) delete process.env.YX_BASE_DOMAIN;
  });

  describe('which ways in the screen offers', () => {
    it('no company known: what YukthiX has set up, the same for everyone', async () => {
      const res = await request(server()).get('/api/v1/auth/sign-in-options').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ google: true, microsoft: true, emailCode: true }));
    });

    it("a known company: only what its policy allows; SSO-only turns them off; an unknown company looks like one with everything off", async () => {
      const opts = (slug: string) => request(server()).get('/api/v1/auth/sign-in-options').set('Host', `${slug}.${BASE}`).expect(200);
      expect((await opts(orgs.a.slug)).body).toEqual({ google: true, microsoft: true, sms: false, whatsapp: false, emailCode: true });
      const off = { google: false, microsoft: false, sms: false, whatsapp: false, emailCode: false };
      expect((await opts(orgs.off.slug)).body).toEqual(off);
      expect((await opts(orgs.ssoOnly.slug)).body).toEqual(off);
      expect((await opts(`nobody-${runId}`)).body).toEqual(off);
    });

    it('an unknown provider is not available', async () => {
      await start('github').expect(404);
    });
  });

  describe('Google', () => {
    it('sends the browser to the provider with PKCE (S256), state, nonce and the per-provider redirect URI', async () => {
      const url = new URL((await start('google').expect(200)).body.url);
      expect(url.origin + url.pathname).toBe(`${idp.url}/google/auth`);
      expect(url.searchParams.get('client_id')).toBe('yx-mock-google');
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('code_challenge')).toBeTruthy();
      expect(url.searchParams.get('state')).toBeTruthy();
      expect(url.searchParams.get('nonce')).toBeTruthy();
      expect(url.searchParams.get('redirect_uri')).toBe(`${process.env.API_ORIGIN}/api/v1/auth/social/google/callback`);
    });

    it('a verified address signs in to its one company; the subject is linked and audited; the result rides in the fragment', async () => {
      const { location } = await callback('google', google(`g-ana-${runId}`, at('ana')));
      expect(location).toMatch(/\/yx\/sign-in\/callback#code=/);
      expect(new URL(location).search).toBe('');
      const res = await exchange(fragment(location).get('code')).expect(200);
      const { sid } = jwt.decode(res.body.accessToken) as { sid: string };
      const session = await tenantPrisma.forTenant(SUPER, (tx) => tx.session.findUniqueOrThrow({ where: { id: sid } }));
      expect(session).toEqual(expect.objectContaining({ userId: users[`${at('ana')}:${orgs.a.id}`], method: 'google', assuranceLevel: 'aal1' }));
      expect(String(res.headers['set-cookie'])).toMatch(/refresh_token=/);
      expect(await links(users[`${at('ana')}:${orgs.a.id}`])).toEqual([expect.objectContaining({ provider: 'google', subject: `g-ana-${runId}`, organizationId: orgs.a.id })]);
      const audit = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findFirst({ where: { action: 'user.external_identity_linked', entityId: users[`${at('ana')}:${orgs.a.id}`] } }));
      expect(auditMeta(audit)).toEqual({ provider: 'google' });
      expect(await lastEvent('google', orgs.a.id)).toEqual(expect.objectContaining({ result: 'success', userId: users[`${at('ana')}:${orgs.a.id}`] }));
    });

    it('later, the linked subject signs in even after the Google address changed', async () => {
      const res = await signIn('google', google(`g-ana-${runId}`, `renamed-${runId}@elsewhere.test`)).expect(200);
      expect((jwt.decode(res.body.accessToken) as { sub: string }).sub).toBe(users[`${at('ana')}:${orgs.a.id}`]);
    });

    it('an account linked to one Google account is never opened by another one with the same address', async () => {
      await signIn('google', google(`g-linked-${runId}`, at('linked'))).expect(200);
      const res = await signIn('google', google(`g-impostor-${runId}`, at('linked'))).expect(401);
      expect(res.body.message).toBe('Invalid credentials');
    });

    it('an address Google has not verified is refused like a wrong password', async () => {
      const res = await signIn('google', google(`g-unverified-${runId}`, at('ana'), false)).expect(401);
      expect(res.body.message).toBe('Invalid credentials');
      expect(await lastEvent('google')).toEqual(expect.objectContaining({ result: 'failed', reason: 'unknown_user' }));
    });

    it('a company that has not turned it on is refused like a wrong password (the reason is in its login activity)', async () => {
      const res = await signIn('google', google(`g-offer-${runId}`, at('offer'))).expect(401);
      expect(res.body.message).toBe('Invalid credentials');
      expect(await lastEvent('google', orgs.off.id)).toEqual(expect.objectContaining({ result: 'failed', reason: 'social_disabled' }));
    });

    it('SSO-only turns it off', async () => {
      await signIn('google', google(`g-sso-${runId}`, at('sso'))).expect(401);
      expect(await lastEvent('google', orgs.ssoOnly.id)).toEqual(expect.objectContaining({ reason: 'social_disabled' }));
    });

    it('YukthiX staff are never reachable', async () => {
      const res = await signIn('google', google(`g-staff-${runId}`, at('staff'))).expect(401);
      expect(res.body.message).toBe('Invalid credentials');
      const staffSessions = await tenantPrisma.forTenant(SUPER, (tx) => tx.session.count({ where: { userId: users[`${at('staff')}:staff`] } }));
      expect(staffSessions).toBe(0);
    });

    it('accounts in several companies: the company picker (single-use, device-bound), then the picked one is linked', async () => {
      const choice = (await signIn('google', google(`g-both-${runId}`, at('both')), device('p')).expect(200)).body;
      expect(choice).toEqual(expect.objectContaining({ selectionRequired: true, selectionToken: expect.any(String) }));
      expect(choice.companies.map((c: { id: string }) => c.id).sort()).toEqual([orgs.a.id, orgs.b.id].sort());
      // Not from another device.
      await request(server()).post('/api/v1/auth/staff/select-company').set('Cookie', device('q')).send({ selectionToken: choice.selectionToken, organizationId: orgs.b.id }).expect(401);
      const again = (await signIn('google', google(`g-both-${runId}`, at('both')), device('p')).expect(200)).body;
      const picked = await request(server())
        .post('/api/v1/auth/staff/select-company')
        .set('Cookie', device('p'))
        .send({ selectionToken: again.selectionToken, organizationId: orgs.b.id })
        .expect(200);
      expect((jwt.decode(picked.body.accessToken) as { sub: string }).sub).toBe(users[`${at('both')}:${orgs.b.id}`]);
      expect(await links(users[`${at('both')}:${orgs.b.id}`])).toEqual([expect.objectContaining({ subject: `g-both-${runId}` })]);
      expect(await links(users[`${at('both')}:${orgs.a.id}`])).toEqual([]);
    });

    it('with the company known (web address), only that company is a candidate', async () => {
      const started = await start('google', device('h'), `${orgs.a.slug}.${BASE}`).expect(200);
      const back = await idp.signIn(started.body.url, google(`g-both-${runId}-h`, at('both')));
      const res = await request(server()).get(back).set('Cookie', device('h')).expect(302);
      const signedIn = await exchange(fragment(res.headers.location).get('code'), device('h')).expect(200);
      expect((jwt.decode(signedIn.body.accessToken) as { sub: string }).sub).toBe(users[`${at('both')}:${orgs.a.id}`]);
    });

    it('MFA is still required: the second step is owed and nothing is linked until it is given', async () => {
      const res = await signIn('google', google(`g-fac-${runId}`, at('fac'))).expect(200);
      expect(res.body).toEqual(expect.objectContaining({ mfaRequired: true, mfaToken: expect.any(String), factors: expect.arrayContaining(['totp']) }));
      expect(res.body.accessToken).toBeUndefined();
      expect(String(res.headers['set-cookie'] ?? '')).not.toMatch(/refresh_token=/);
      expect(await links(users[`${at('fac')}:${orgs.a.id}`])).toEqual([]);
    });

    it('a sensitive role without a second factor signs in and is sent to enrol (AAL rules as for passwords)', async () => {
      const res = await signIn('google', google(`g-admin-${runId}`, at('admin'))).expect(200);
      expect(res.body.mfa).toEqual(expect.objectContaining({ required: true }));
    });
  });

  describe('Microsoft', () => {
    const takeover = () =>
      microsoft(randomUUID(), { tid: OTHER_TENANT, email: at('ana'), preferred_username: `intruder@intruder-${runId}.test` });

    it('an address Microsoft marks verified (xms_edov) signs in', async () => {
      const oid = randomUUID();
      const res = await signIn('microsoft', microsoft(oid, { email: at('ana'), xms_edov: true, preferred_username: `ana@${randomUUID()}.onmicrosoft.com` })).expect(200);
      expect((jwt.decode(res.body.accessToken) as { sub: string }).sub).toBe(users[`${at('ana')}:${orgs.a.id}`]);
      expect(await links(users[`${at('ana')}:${orgs.a.id}`])).toEqual(
        expect.arrayContaining([expect.objectContaining({ provider: 'microsoft', subject: `${WORK_TENANT}:${oid}` })]),
      );
    });

    it('"nOAuth": another directory putting the address in the plain email claim is refused', async () => {
      const res = await signIn('microsoft', takeover()).expect(401);
      expect(res.body.message).toBe('Invalid credentials');
      expect(await lastEvent('microsoft')).toEqual(expect.objectContaining({ result: 'failed', reason: 'unknown_user' }));
    });

    it('a work sign-in name on a domain the company verified signs in there, and only there', async () => {
      const res = await signIn('microsoft', microsoft(randomUUID(), { email: `spoofed-${runId}@elsewhere.test`, preferred_username: at('dom') })).expect(200);
      // Company A verified DOMAIN; company B (same address) did not: no picker, A only.
      expect(res.body.selectionRequired).toBeUndefined();
      expect((jwt.decode(res.body.accessToken) as { sub: string }).sub).toBe(users[`${at('dom')}:${orgs.a.id}`]);
    });

    it('a personal Microsoft account never uses the domain rule', async () => {
      await signIn('microsoft', microsoft(randomUUID(), { tid: MICROSOFT_CONSUMER_TENANT, preferred_username: at('dom') })).expect(401);
    });

    it('a token with no directory / object id is refused at the callback', async () => {
      const { location } = await callback('microsoft', { sub: `no-oid-${runId}`, email: at('ana'), xms_edov: true });
      expect(fragment(location).get('error')).toBe('signin_failed');
      expect(await lastEvent('microsoft')).toEqual(expect.objectContaining({ reason: 'no_stable_subject' }));
    });
  });

  describe('the protocol is enforced', () => {
    it('state mismatch: refused', async () => {
      const started = await start('google').expect(200);
      const back = new URL(await idp.signIn(started.body.url, google(`g-state-${runId}`, at('ana'))), 'http://x');
      back.searchParams.set('state', 'not-the-state');
      const res = await request(server()).get(back.pathname + back.search).set('Cookie', device('a')).expect(302);
      expect(fragment(res.headers.location).get('error')).toBe('signin_failed');
      expect(await lastEvent('google')).toEqual(expect.objectContaining({ reason: 'oidc_state_invalid' }));
    });

    it('PKCE mismatch (a code from one sign-in with the state of another): refused', async () => {
      const first = await start('google').expect(200);
      const second = await start('google').expect(200);
      const backFirst = new URL(await idp.signIn(first.body.url, google(`g-pkce-${runId}`, at('ana'))), 'http://x');
      const secondState = new URL(second.body.url).searchParams.get('state')!;
      backFirst.searchParams.set('state', secondState);
      const res = await request(server()).get(backFirst.pathname + backFirst.search).set('Cookie', device('a')).expect(302);
      expect(fragment(res.headers.location).get('error')).toBe('signin_failed');
      expect(await lastEvent('google')).toEqual(expect.objectContaining({ reason: 'oidc_invalid_response' }));
    });

    it('nonce mismatch: refused', async () => {
      const { location } = await callback('google', google(`g-nonce-${runId}`, at('ana')), { nonce: 'not-the-nonce' });
      expect(fragment(location).get('error')).toBe('signin_failed');
      expect(await lastEvent('google')).toEqual(expect.objectContaining({ reason: 'oidc_invalid_response' }));
    });

    it('a replayed callback is refused (state is single-use)', async () => {
      const { back } = await callback('google', google(`g-replay-${runId}`, at('ana')));
      const res = await request(server()).get(back).set('Cookie', device('a')).expect(302);
      expect(fragment(res.headers.location).get('error')).toBe('signin_failed');
      expect(await lastEvent('google')).toEqual(expect.objectContaining({ reason: 'oidc_state_invalid' }));
    });

    it("a response for one provider can't be finished on the other's callback", async () => {
      const started = await start('google').expect(200);
      const back = await idp.signIn(started.body.url, google(`g-mixup-${runId}`, at('ana')));
      const res = await request(server()).get(back.replace('/social/google/', '/social/microsoft/')).set('Cookie', device('a')).expect(302);
      expect(fragment(res.headers.location).get('error')).toBe('signin_failed');
      expect(await lastEvent('microsoft')).toEqual(expect.objectContaining({ reason: 'social_provider_mismatch' }));
    });

    it('only the browser that started it can finish it, and the code works once', async () => {
      const { location } = await callback('google', google(`g-device-${runId}`, at('ana')), { cookie: device('a'), back: device('z') });
      expect(fragment(location).get('error')).toBe('signin_failed');

      const ok = await callback('google', google(`g-ana-${runId}`, at('ana')));
      const code = fragment(ok.location).get('code');
      await exchange(code, device('z')).expect(401);
      // Spent by the wrong device too.
      await exchange(code).expect(401);
      const fresh = await callback('google', google(`g-ana-${runId}`, at('ana')));
      const freshCode = fragment(fresh.location).get('code');
      await exchange(freshCode).expect(200);
      await exchange(freshCode).expect(401);
    });
  });

  describe('Settings › Security', () => {
    it('turning a switch on needs a step-up and is audited; turning it off ends the sessions that came in that way', async () => {
      const adminId = await createUser(at('badmin'), orgs.b, 'org_admin');
      const adminAccess = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: orgs.b.slug, email: at('badmin'), password: PASSWORD }).expect(200)).body
        .accessToken;
      const patch = (body: object) => request(server()).patch('/api/v1/security/policy').set('Authorization', `Bearer ${adminAccess}`).send(body);
      await patch({ microsoftSignIn: false }).expect(403); // no step-up yet
      await markSteppedUp(tenantPrisma, adminAccess);

      const viaGoogle = (await signIn('google', google(`g-both-b-${runId}`, at('badmin'))).expect(200)).body.accessToken;
      const { sid } = jwt.decode(viaGoogle) as { sid: string };
      await patch({ googleSignIn: false }).expect(200);
      const session = await tenantPrisma.forTenant(SUPER, (tx) => tx.session.findUniqueOrThrow({ where: { id: sid } }));
      expect(session).toEqual(expect.objectContaining({ revokedReason: 'social_sign_in_disabled' }));
      expect(session.revokedAt).not.toBeNull();
      const audit = await tenantPrisma.forTenant(SUPER, (tx) =>
        tx.auditLog.findFirst({ where: { organizationId: orgs.b.id, action: 'security_policy.updated', actorUserId: adminId }, orderBy: { createdAt: 'desc' } }),
      );
      expect(auditMeta(audit)).toEqual(expect.objectContaining({ changes: { googleSignIn: { from: true, to: false } }, sessionsRevoked: expect.any(Number) }));
      expect(auditMeta(audit).sessionsRevoked).toBeGreaterThanOrEqual(1);
      // And now Google is refused for company B.
      await signIn('google', google(`g-both-b-${runId}`, at('badmin'))).expect(401);
    });
  });
});
