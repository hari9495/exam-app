import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import cookieParser from 'cookie-parser';
import { JwtService } from '@nestjs/jwt';
import { OrgSecretsCryptoService, PrismaService, STEP_UP_REQUIRED_CODE, TenantPrismaService, invalidateTenantSecurityPolicy } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { markSteppedUp } from './fixtures/step-up';
import { OidcTestIssuer, Tamper } from './fixtures/oidc-test-issuer';

// P12 Part 1e end to end: OpenID Connect sign-in through openid-client against a local mock
// issuer (no Google / Microsoft call), the identity-provider admin API, domain routing, JIT and
// IdP-asserted MFA, on the real database (forced RLS, app role) and real Redis (YX-IAM-04/05/10).
describe('OIDC single sign-on and identity providers (P12 Part 1e, YX-IAM-04/05)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const issuer = new OidcTestIssuer();
  const jwt = new JwtService({});
  const email = { send: jest.fn().mockResolvedValue({ success: true }) };
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const runId = randomUUID().slice(0, 8);
  const DOMAIN = `acme-${runId}.test`;
  const at = (name: string) => `${name}@${DOMAIN}`;

  let planId: string;
  let orgA: { id: string; slug: string };
  let orgB: { id: string; slug: string };
  const users: Record<string, string> = {};
  let adminAccess: string;
  let providerId: string;
  let orgBProviderId: string;

  const server = () => app.getHttpServer();
  const device = (c: string) => `yx_device=${c.repeat(43)}`;
  const sidOf = (access: string) => (jwt.decode(access) as { sid: string }).sid;
  const session = (id: string) => tenantPrisma.forTenant(SUPER, (tx) => tx.session.findUniqueOrThrow({ where: { id } }));
  // An unknown state names no company: that attempt is recorded at platform level (organizationId null).
  const lastOidcEvent = (organizationId: string | null = orgA.id) =>
    tenantPrisma.forTenant(SUPER, (tx) => tx.loginEvent.findFirst({ where: { organizationId, method: 'oidc' }, orderBy: { createdAt: 'desc' } }));
  const admin = (method: 'get' | 'post' | 'patch' | 'delete', path: string, token = adminAccess) =>
    request(server())[method](`/api/v1/security/identity-providers${path}`).set('Authorization', `Bearer ${token}`);

  function start(body: object, cookie = device('a')) {
    return request(server()).post('/api/v1/auth/sso/start').set('Cookie', cookie).send({ organizationSlug: orgA.slug, ...body });
  }
  // The whole browser round trip: start -> IdP -> callback. Returns the callback's redirect.
  async function signIn(who: string, claims: Record<string, unknown> = {}, tamper: Tamper = {}, cookies = { start: device('a'), back: device('a') }) {
    const started = await start({ email: who }, cookies.start);
    expect(started.status).toBe(200);
    const back = issuer.authorize(started.body.url, { sub: `sub-${who}`, email: who, email_verified: true, name: 'Test Person', ...claims }, tamper);
    const res = await request(server()).get(back).set('Cookie', cookies.back);
    expect(res.status).toBe(302);
    return { location: new URL(res.headers.location), back };
  }
  const exchange = (code: string | null) => request(server()).post('/api/v1/auth/sso/exchange').set('Cookie', device('a')).send({ code });

  beforeAll(async () => {
    await issuer.start();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue(email).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    planId = (await prisma.plan.create({ data: { name: `oidc-plan-${runId}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    orgA = await prisma.organization.create({ data: { name: 'OIDC A', slug: `oidc-a-${runId}`, planId }, select: { id: true, slug: true } });
    orgB = await prisma.organization.create({ data: { name: 'OIDC B', slug: `oidc-b-${runId}`, planId }, select: { id: true, slug: true } });
    const passwordHash = await argon2.hash(PASSWORD);
    for (const [who, role, org] of [
      [at('admin'), 'org_admin', orgA],
      [at('admin2'), 'org_admin', orgA],
      [at('ana'), 'recruiter', orgA],
      [at('fac'), 'recruiter', orgA],
    ] as const) {
      users[who] = (
        await tenantPrisma.forTenant({ organizationId: org.id, isSuperAdmin: false }, (tx) =>
          tx.user.create({ data: { organizationId: org.id, email: who, passwordHash, role } }),
        )
      ).id;
    }
    // A second factor written straight to the table (the enrolment flow is proven in mfa.e2e).
    const secretEncrypted = app.get(OrgSecretsCryptoService).encrypt('JBSWY3DPEHPK3PXP');
    await tenantPrisma.forTenant(SUPER, (tx) =>
      tx.authenticator.create({ data: { organizationId: orgA.id, userId: users[at('fac')], type: 'totp', label: 'Phone', secretEncrypted } }),
    );

    adminAccess = (
      await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: orgA.slug, email: at('admin'), password: PASSWORD }).expect(200)
    ).body.accessToken;
    await markSteppedUp(tenantPrisma, adminAccess);

    // Another company's active provider, for the cross-tenant checks.
    orgBProviderId = (
      await tenantPrisma.forTenant({ organizationId: orgB.id, isSuperAdmin: false }, (tx) =>
        tx.identityProvider.create({
          data: {
            organizationId: orgB.id,
            type: 'oidc_generic',
            name: 'B IdP',
            status: 'active',
            oidcIssuer: issuer.issuer,
            oidcClientId: issuer.clientId,
            oidcClientSecretEncrypted: app.get(OrgSecretsCryptoService).encrypt(issuer.clientSecret),
          },
        }),
      )
    ).id;
  });

  afterAll(async () => {
    const ids = [orgA.id, orgB.id];
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        await tx.ssoLoginCode.deleteMany({ where: { user: { organizationId: { in: ids } } } });
        await tx.refreshToken.deleteMany({ where: { user: { organizationId: { in: ids } } } });
        await tx.session.deleteMany({ where: { organizationId: { in: ids } } });
        await tx.user.deleteMany({ where: { organizationId: { in: ids } } });
        await tx.tenantSecurityPolicy.deleteMany({ where: { organizationId: { in: ids } } });
        await tx.organization.deleteMany({ where: { id: { in: ids } } });
      })
      .catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
    await issuer.stop();
  });

  describe('admin API', () => {
    it('creates an OIDC provider (step-up, audited); the client secret is stored encrypted and never returned', async () => {
      const created = await admin('post', '')
        .send({
          type: 'oidc_generic',
          name: 'Acme IdP',
          oidcIssuer: issuer.issuer,
          oidcClientId: issuer.clientId,
          oidcClientSecret: issuer.clientSecret,
          domains: [DOMAIN.toUpperCase()],
          jitEnabled: true,
          jitRole: 'panel',
          status: 'active',
        })
        .expect(201);
      providerId = created.body.id;
      expect(created.body).toEqual(expect.objectContaining({ status: 'active', domains: [DOMAIN], clientSecretSet: true, jitRole: 'panel' }));
      expect(JSON.stringify(created.body)).not.toContain(issuer.clientSecret);

      const row = await tenantPrisma.forTenant(SUPER, (tx) => tx.identityProvider.findUniqueOrThrow({ where: { id: providerId } }));
      expect(row.oidcClientSecretEncrypted).not.toContain(issuer.clientSecret);
      expect(app.get(OrgSecretsCryptoService).decrypt(row.oidcClientSecretEncrypted!)).toBe(issuer.clientSecret);

      const list = await admin('get', '').expect(200);
      expect(JSON.stringify(list.body)).not.toContain(issuer.clientSecret);
      const audit = await tenantPrisma.forTenant(SUPER, (tx) =>
        tx.auditLog.findFirstOrThrow({ where: { organizationId: orgA.id, action: 'identity_provider.created', entityId: providerId } }),
      );
      expect(JSON.stringify(audit)).not.toContain(issuer.clientSecret);
    });

    it('needs a fresh step-up, the settings permission, and is refused for another company\'s provider', async () => {
      const fresh = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: orgA.slug, email: at('admin2'), password: PASSWORD }).expect(200))
        .body.accessToken;
      const refused = await admin('patch', `/${providerId}`, fresh).send({ name: 'x' }).expect(403);
      expect(refused.body.code).toBe(STEP_UP_REQUIRED_CODE);

      const recruiter = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: orgA.slug, email: at('ana'), password: PASSWORD }).expect(200))
        .body.accessToken;
      await admin('get', '', recruiter).expect(403);

      await admin('patch', `/${orgBProviderId}`).send({ name: 'hijacked' }).expect(404);
      await admin('delete', `/${orgBProviderId}`).expect(404);
      const b = await tenantPrisma.forTenant(SUPER, (tx) => tx.identityProvider.findUniqueOrThrow({ where: { id: orgBProviderId } }));
      expect(b.name).toBe('B IdP');
    });

    it('refuses an Entra provider without a directory id, a sensitive JIT role, and a domain owned by another provider', async () => {
      await admin('post', '').send({ type: 'oidc_entra', name: 'Entra', entraTenantId: 'common' }).expect(400);
      await admin('post', '').send({ type: 'oidc_entra', name: 'Entra' }).expect(400);
      await admin('patch', `/${providerId}`).send({ jitRole: 'recruiter' }).expect(400);
      await admin('patch', `/${providerId}`).send({ jitRole: 'org_admin' }).expect(400);
      await admin('post', '').send({ type: 'oidc_google', name: 'Google', domains: [DOMAIN] }).expect(409);
    });

    it('lists active providers for the login page by name and type only', async () => {
      const res = await request(server()).get(`/api/v1/auth/sso/${orgA.slug}/providers`).expect(200);
      expect(res.body).toEqual([{ id: providerId, name: 'Acme IdP', type: 'oidc_generic' }]);
    });
  });

  describe('sign-in', () => {
    it('sends the browser to the IdP with PKCE (S256), state, nonce and the fixed redirect URI', async () => {
      const res = await start({ email: at('ana') }).expect(200);
      const url = new URL(res.body.url);
      expect(url.origin).toBe(issuer.issuer);
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('state')).toBeTruthy();
      expect(url.searchParams.get('nonce')).toBeTruthy();
      expect(url.searchParams.get('client_id')).toBe(issuer.clientId);
      expect(url.searchParams.get('redirect_uri')).toBe(`${process.env.API_ORIGIN}/api/v1/auth/oidc/callback`);
      expect(url.searchParams.get('login_hint')).toBe(at('ana'));
    });

    it('signs an existing account in at AAL1 when the IdP asserts no MFA, and records the login', async () => {
      const { location } = await signIn(at('ana'));
      const code = location.searchParams.get('code');
      expect(code).toMatch(/^[0-9a-f]{64}$/);
      const res = await exchange(code).expect(200);
      expect(jwt.decode(res.body.accessToken)).toEqual(expect.objectContaining({ sub: users[at('ana')], organizationId: orgA.id }));
      expect(await session(sidOf(res.body.accessToken))).toEqual(expect.objectContaining({ method: 'oidc', assuranceLevel: 'aal1' }));
      expect(await lastOidcEvent()).toEqual(expect.objectContaining({ result: 'success', userId: users[at('ana')] }));
    });

    it('opens an AAL2 session when the IdP asserts MFA (amr), with no YukthiX challenge', async () => {
      const { location } = await signIn(at('fac'), { amr: ['pwd', 'mfa'] });
      const res = await exchange(location.searchParams.get('code')).expect(200);
      expect(res.body.accessToken).toBeDefined();
      expect(await session(sidOf(res.body.accessToken))).toEqual(expect.objectContaining({ assuranceLevel: 'aal2', mfaMethod: 'idp' }));
    });

    it('without IdP MFA, an account with a factor must still give it (the 1c rules apply)', async () => {
      const { location } = await signIn(at('fac'));
      const res = await exchange(location.searchParams.get('code')).expect(200);
      expect(res.body).toEqual(expect.objectContaining({ mfaRequired: true, factors: expect.arrayContaining(['totp']) }));
      expect(res.body.accessToken).toBeUndefined();
    });

    it('JIT creates a new account at the provider\'s domain in the configured non-sensitive role, and audits it', async () => {
      const { location } = await signIn(at('newbie'), { name: 'New Bie' });
      await exchange(location.searchParams.get('code')).expect(200);
      const created = await tenantPrisma.forTenant(SUPER, (tx) => tx.user.findFirstOrThrow({ where: { organizationId: orgA.id, email: at('newbie') } }));
      expect(created).toEqual(expect.objectContaining({ role: 'panel', name: 'New Bie', status: 'active' }));
      await tenantPrisma.forTenant(SUPER, (tx) =>
        tx.auditLog.findFirstOrThrow({ where: { organizationId: orgA.id, action: 'user.jit_provisioned', entityId: created.id } }),
      );
    });

    it('refuses an unverified email and an address outside the provider\'s domains, creating nobody', async () => {
      const unverified = await signIn(at('unverified'), { email_verified: false });
      expect(unverified.location.searchParams.get('ssoError')).toBe('not_provisioned');
      expect((await lastOidcEvent())?.reason).toBe('no_verified_email');

      // Routed by explicit provider id, but the IdP vouches for a foreign domain.
      const started = await start({ providerId });
      const back = issuer.authorize(started.body.url, { sub: 'x', email: 'eve@elsewhere.test', email_verified: true });
      const res = await request(server()).get(back).set('Cookie', device('a'));
      expect(res.headers.location).toContain('ssoError=not_provisioned');
      expect((await lastOidcEvent())?.reason).toBe('domain_not_allowed');
      const count = await tenantPrisma.forTenant(SUPER, (tx) => tx.user.count({ where: { email: { in: [at('unverified'), 'eve@elsewhere.test'] } } }));
      expect(count).toBe(0);
    });

    const tampered: [string, Tamper][] = [
      ['a different nonce', { nonce: 'replayed-nonce' }],
      ['another issuer', { issuer: 'https://evil.example.com' }],
      ['another audience', { audience: 'someone-else' }],
      ['an expired ID token', { expiresInSeconds: -600 }],
      ['a signature by a key not in the JWKS', { signWithForeignKey: true }],
      ['a PKCE verifier that does not match', { wrongVerifier: true }],
    ];
    it.each(tampered)('refuses an ID token with %s', async (_label, tamper) => {
      const { location } = await signIn(at('ana'), {}, tamper);
      expect(location.searchParams.get('ssoError')).toBe('invalid_response');
      expect(location.searchParams.get('code')).toBeNull();
      expect((await lastOidcEvent())?.reason).toBe('oidc_invalid_response');
    });

    it('a callback is single-use: replaying it (state) is refused', async () => {
      const { location, back } = await signIn(at('ana'));
      expect(location.searchParams.get('code')).toBeTruthy();
      const replay = await request(server()).get(back).set('Cookie', device('a'));
      expect(replay.headers.location).toContain('ssoError=invalid_response');
      expect((await lastOidcEvent(null))?.reason).toBe('oidc_state_invalid');
    });

    it('only the browser that started the sign-in can finish it (login CSRF)', async () => {
      const { location, back } = await signIn(at('ana'), {}, {}, { start: device('a'), back: device('b') });
      expect(location.searchParams.get('ssoError')).toBe('invalid_response');
      expect((await lastOidcEvent())?.reason).toBe('oidc_device_mismatch');
      // ...and the attempt burnt the state: the right browser cannot use it afterwards either.
      const retry = await request(server()).get(back).set('Cookie', device('a'));
      expect(retry.headers.location).toContain('ssoError=invalid_response');
    });

    it('an unknown or missing state is refused before any call to the IdP', async () => {
      const before = issuer.tokenRequests;
      for (const query of ['?code=abc&state=forged', '?code=abc', '']) {
        const res = await request(server()).get(`/api/v1/auth/oidc/callback${query}`).set('Cookie', device('a'));
        expect(res.headers.location).toContain('ssoError=invalid_response');
      }
      expect(issuer.tokenRequests).toBe(before);
    });

    it('a sign-in code is single-use', async () => {
      const { location } = await signIn(at('ana'));
      const code = location.searchParams.get('code');
      await exchange(code).expect(200);
      await exchange(code).expect(401);
    });

    it('another company\'s provider cannot be used to sign in here, and unknown domains are not routed', async () => {
      await start({ providerId: orgBProviderId }).expect(404);
      await start({ email: 'someone@unknown.test' }).expect(404);
      await request(server()).post('/api/v1/auth/sso/start').send({ organizationSlug: `missing-${runId}`, email: at('ana') }).expect(404);
    });

    it('a provider switched off mid-sign-in cannot finish it', async () => {
      const started = await start({ email: at('ana') }).expect(200);
      await admin('patch', `/${providerId}`).send({ status: 'disabled' }).expect(200);
      try {
        const back = issuer.authorize(started.body.url, { sub: 'x', email: at('ana'), email_verified: true });
        const res = await request(server()).get(back).set('Cookie', device('a'));
        expect(res.headers.location).toContain('ssoError=invalid_response');
        expect((await lastOidcEvent())?.reason).toBe('identity_provider_disabled');
      } finally {
        await admin('patch', `/${providerId}`).send({ status: 'active' }).expect(200);
      }
    });
  });

  describe('SSO-only (YX-IAM-04)', () => {
    afterAll(async () => {
      await tenantPrisma.forTenant(SUPER, (tx) => tx.tenantSecurityPolicy.deleteMany({ where: { organizationId: orgA.id } }));
      invalidateTenantSecurityPolicy(orgA.id);
    });

    it('needs an active provider; the last active provider cannot then be switched off or removed', async () => {
      await request(server())
        .patch('/api/v1/security/policy')
        .set('Authorization', `Bearer ${adminAccess}`)
        .send({ ssoOnly: true, breakGlassUserIds: [users[at('admin')], users[at('admin2')]] })
        .expect(200);
      invalidateTenantSecurityPolicy(orgA.id);

      await admin('patch', `/${providerId}`).send({ status: 'disabled' }).expect(400);
      await admin('delete', `/${providerId}`).expect(400);
      // Password sign-in is off for everyone else; SSO still works.
      await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: orgA.slug, email: at('ana'), password: PASSWORD }).expect(401);
      const { location } = await signIn(at('ana'));
      await exchange(location.searchParams.get('code')).expect(200);

      await request(server()).patch('/api/v1/security/policy').set('Authorization', `Bearer ${adminAccess}`).send({ ssoOnly: false }).expect(200);
      invalidateTenantSecurityPolicy(orgA.id);
      await admin('delete', `/${providerId}`).expect(200);
      await tenantPrisma.forTenant(SUPER, (tx) =>
        tx.auditLog.findFirstOrThrow({ where: { organizationId: orgA.id, action: 'identity_provider.deleted', entityId: providerId } }),
      );
      // Domains go with it (composite FK cascade).
      expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.identityProviderDomain.count({ where: { identityProviderId: providerId } }))).toBe(0);
    });
  });
});
