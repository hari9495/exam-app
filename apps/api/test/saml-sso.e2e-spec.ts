import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { createHash, randomUUID } from 'crypto';
import { inflateRawSync } from 'zlib';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { SamlCacheProvider } from '../src/auth/saml-cache.provider';
import { getTestIdp, buildSignedSamlResponse, TestIdp } from './fixtures/saml-test-idp';
import { markSteppedUp } from './fixtures/step-up';
import { generate } from 'selfsigned';

describe('SAML SSO end-to-end flow', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let samlCacheProvider: SamlCacheProvider;
  let testIdp: TestIdp;
  let planId: string;
  let orgId: string;
  let orgSlug: string;
  let orgAdminAccessToken: string;
  let preProvisionedUserId: string;
  let firstProviderId: string;

  // The SamlStrategy config (see resolveOrgSamlConfig in saml.strategy.ts) sets
  // validateInResponseTo: ValidateInResponseTo.always -- so every ACS callback,
  // even ones that will be rejected for other reasons (e.g. not_provisioned),
  // requires a genuinely cached AuthnRequest ID or node-saml throws before ever
  // reaching SamlStrategy.validate(). This mints one directly through the same
  // real SamlCacheProvider (Redis-backed) the live AuthnRequest-generation path
  // uses, exactly mirroring what a real SP-initiated redirect would have cached.
  // The browser that "started" the sign-in: its device cookie is stored with the request ID, and
  // only it can redeem the resulting code (login CSRF).
  const DEVICE = 'S'.repeat(43);
  async function mintCachedRequestId(providerId = firstProviderId, device: string | null = DEVICE): Promise<string> {
    const requestId = `_${randomUUID()}`;
    await samlCacheProvider
      .forRequest(providerId, device ? createHash('sha256').update(device).digest('hex') : null)
      .saveAsync(requestId, new Date().toISOString());
    return requestId;
  }
  // The code rides in the URL fragment (never a query string: ASVS V3.1.1).
  const codeOf = (response: { headers: Record<string, string> }) => new URLSearchParams(new URL(response.headers.location).hash.slice(1)).get('code');
  const exchange = (code: string | null, device = DEVICE) =>
    request(app.getHttpServer()).post('/api/v1/auth/sso/exchange').set('Cookie', `yx_device=${device}`).send({ code });

  beforeAll(async () => {
    testIdp = await getTestIdp();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser()); // as main.ts: the device cookie binds the sign-in to its browser
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    samlCacheProvider = moduleRef.get(SamlCacheProvider);

    const plan = await prisma.plan.create({
      data: { name: `ci-saml-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    orgSlug = `ci-saml-org-${randomUUID()}`;
    const org = await prisma.organization.create({ data: { name: 'CI SAML Org', slug: orgSlug, planId } });
    orgId = org.id;

    const orgAdminHash = await argon2.hash('OrgAdminPassw0rd!');
    const orgAdmin = await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.user.create({ data: { organizationId: orgId, email: 'orgadmin@ci-saml.test', passwordHash: orgAdminHash, role: 'org_admin' } }),
    );

    orgAdminAccessToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: orgSlug, email: orgAdmin.email, password: 'OrgAdminPassw0rd!' })
        .expect(200)
    ).body.accessToken;
    // Changing the identity provider is a step-up action (P12 §3); proven in mfa.e2e-spec.ts.
    await markSteppedUp(tenantPrisma, orgAdminAccessToken);

    // Pre-provision the staff member who will "log in via SSO" -- this is
    // the exact same real POST /users flow a recruiter/org-admin would use.
    const recruiterHash = await argon2.hash(randomUUID());
    const recruiter = await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.user.create({ data: { organizationId: orgId, email: 'alice@ci-saml.test', passwordHash: recruiterHash, role: 'recruiter' } }),
    );
    preProvisionedUserId = recruiter.id;

    // The company's SAML identity provider (P12 Part 1e), set up the way an admin does it. It speaks
    // for ci-saml.test only: a provider vouches for the email domains mapped to it, nobody else.
    const created = await request(app.getHttpServer())
      .post('/api/v1/security/identity-providers')
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .send({
        type: 'saml',
        name: 'Test IdP',
        samlEntityId: 'test-idp',
        samlSsoUrl: 'https://test-idp.example.com/sso',
        samlCertificate: testIdp.cert,
        domains: ['ci-saml.test'],
        mfaTrusted: true,
      })
      .expect(201);
    firstProviderId = created.body.id;
    await request(app.getHttpServer())
      .patch(`/api/v1/security/identity-providers/${firstProviderId}`)
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .send({ status: 'active' })
      .expect(200);
  }, 30000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant({ organizationId: orgId, isSuperAdmin: true }, (tx) => tx.ssoLoginCode.deleteMany({ where: { user: { organizationId: orgId } } }))
      .catch(() => undefined);
    await tenantPrisma
      .forTenant({ organizationId: orgId, isSuperAdmin: true }, (tx) => tx.refreshToken.deleteMany({ where: { user: { organizationId: orgId } } }))
      .catch(() => undefined);
    await tenantPrisma
      .forTenant({ organizationId: orgId, isSuperAdmin: true }, async (tx) => {
        await tx.session.deleteMany({ where: { organizationId: orgId } });
        await tx.user.deleteMany({ where: { organizationId: orgId } });
      })
      .catch(() => undefined);
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  function metadataAudience(): string {
    return `${process.env.API_ORIGIN}/api/v1/auth/saml/${orgSlug}/metadata`;
  }
  function callbackDestination(): string {
    return `${process.env.API_ORIGIN}/api/v1/auth/saml/${orgSlug}/callback`;
  }

  it('rejects the ACS callback for an email that is not pre-provisioned', async () => {
    const inResponseTo = await mintCachedRequestId();
    const signedResponse = buildSignedSamlResponse({
      nameId: 'nobody@ci-saml.test',
      audience: metadataAudience(),
      destination: callbackDestination(),
      inResponseTo,
      privateKey: testIdp.privateKey,
    });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/auth/saml/${orgSlug}/callback`)
      .type('form')
      .send({ SAMLResponse: Buffer.from(signedResponse).toString('base64') });

    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('ssoError=not_provisioned');
  });

  it('accepts a valid signed response for a pre-provisioned user, mints an exchangeable code, and the exchange issues a correctly-scoped token', async () => {
    const inResponseTo = await mintCachedRequestId();
    const signedResponse = buildSignedSamlResponse({
      nameId: 'alice@ci-saml.test',
      audience: metadataAudience(),
      destination: callbackDestination(),
      inResponseTo,
      privateKey: testIdp.privateKey,
    });

    const callbackResponse = await request(app.getHttpServer())
      .post(`/api/v1/auth/saml/${orgSlug}/callback`)
      .type('form')
      .send({ SAMLResponse: Buffer.from(signedResponse).toString('base64') });

    expect(callbackResponse.status).toBe(302);
    const redirectUrl = new URL(callbackResponse.headers.location);
    expect(redirectUrl.search).toBe(''); // nothing in the query string
    const code = codeOf(callbackResponse);
    expect(code).toEqual(expect.any(String));

    const exchangeResponse = await exchange(code).expect(200);

    expect(exchangeResponse.body.accessToken).toEqual(expect.any(String));
    const payloadBase64 = exchangeResponse.body.accessToken.split('.')[1];
    const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));
    expect(payload.organizationId).toBe(orgId);
    expect(payload.role).toBe('recruiter');
    expect(payload.sub).toBe(preProvisionedUserId);
  });

  it('confirms password login still works for the same org (SSO coexists, does not replace)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/staff/login')
      .send({ organizationSlug: orgSlug, email: 'orgadmin@ci-saml.test', password: 'OrgAdminPassw0rd!' })
      .expect(200);
  });

  // ---- P12 Part 1e: IdP-asserted MFA, several SAML IdPs, domains, JIT (YX-IAM-04/05) ----------

  async function callback(nameId: string, options: { issuer?: string; authnContextClassRef?: string; relayState?: string; key?: string; inResponseTo?: string } = {}) {
    const signedResponse = buildSignedSamlResponse({
      nameId,
      audience: metadataAudience(),
      destination: callbackDestination(),
      inResponseTo: options.inResponseTo ?? (await mintCachedRequestId(options.relayState ?? firstProviderId)),
      privateKey: options.key ?? testIdp.privateKey,
      issuer: options.issuer,
      authnContextClassRef: options.authnContextClassRef,
    });
    return request(app.getHttpServer())
      .post(`/api/v1/auth/saml/${orgSlug}/callback`)
      .type('form')
      .send({ SAMLResponse: Buffer.from(signedResponse).toString('base64'), ...(options.relayState ? { RelayState: options.relayState } : {}) });
  }
  const sessionOf = async (accessToken: string) => {
    const { sid } = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString('utf8'));
    return tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.session.findUniqueOrThrow({ where: { id: sid } }));
  };

  it('an IdP trusted for MFA that asserts it (AuthnContextClassRef) opens an AAL2 session; a password-only assertion stays AAL1', async () => {
    const mfa = await callback('alice@ci-saml.test', { authnContextClassRef: 'http://schemas.microsoft.com/claims/multipleauthn' });
    const mfaLogin = await exchange(codeOf(mfa)).expect(200);
    const session = await sessionOf(mfaLogin.body.accessToken);
    expect(session).toEqual(expect.objectContaining({ assuranceLevel: 'aal2', mfaMethod: 'idp', method: 'saml', identityProviderId: firstProviderId }));

    const plain = await callback('alice@ci-saml.test');
    const plainLogin = await exchange(codeOf(plain)).expect(200);
    expect(await sessionOf(plainLogin.body.accessToken)).toEqual(expect.objectContaining({ assuranceLevel: 'aal1' }));
  });

  it('a sign-in code is single-use (replay refused)', async () => {
    const code = codeOf(await callback('alice@ci-saml.test'));
    await exchange(code).expect(200);
    await exchange(code).expect(401);
  });

  // Regression (login CSRF): the code used to work from any browser. An attacker who completes
  // SSO for their own account and gets the victim's browser to the callback no longer signs the
  // victim in as the attacker.
  it('only the browser that started the sign-in can redeem its code', async () => {
    const code = codeOf(await callback('alice@ci-saml.test'));
    await exchange(code, 'V'.repeat(43)).expect(401);
    await exchange(code).expect(401); // burnt by the attempt
  });

  it('the real flow: /login binds the AuthnRequest to the device cookie; the cookie-less IdP POST then yields a code only that browser can redeem', async () => {
    const login = await request(app.getHttpServer()).get(`/api/v1/auth/saml/${orgSlug}/login?RelayState=${firstProviderId}`).set('Cookie', `yx_device=${DEVICE}`).expect(302);
    const samlRequest = new URL(login.headers.location).searchParams.get('SAMLRequest')!;
    const authnRequestId = /ID="([^"]+)"/.exec(inflateRawSync(Buffer.from(samlRequest, 'base64')).toString('utf8'))![1];

    const response = await callback('alice@ci-saml.test', { inResponseTo: authnRequestId, relayState: firstProviderId });
    const code = codeOf(response);
    expect(code).toEqual(expect.any(String));
    await exchange(code, 'W'.repeat(43)).expect(401);

    const again = await request(app.getHttpServer()).get(`/api/v1/auth/saml/${orgSlug}/login?RelayState=${firstProviderId}`).set('Cookie', `yx_device=${DEVICE}`).expect(302);
    const id = /ID="([^"]+)"/.exec(inflateRawSync(Buffer.from(new URL(again.headers.location).searchParams.get('SAMLRequest')!, 'base64')).toString('utf8'))![1];
    await exchange(codeOf(await callback('alice@ci-saml.test', { inResponseTo: id, relayState: firstProviderId }))).expect(200);
  });

  // Regression: InResponseTo was consumed with GET then DEL, so two concurrent POSTs of one
  // captured response could both pass and both mint a code.
  it('a captured response posted twice at once yields one sign-in code, not two', async () => {
    const inResponseTo = await mintCachedRequestId();
    const signed = Buffer.from(
      buildSignedSamlResponse({ nameId: 'alice@ci-saml.test', audience: metadataAudience(), destination: callbackDestination(), inResponseTo, privateKey: testIdp.privateKey }),
    ).toString('base64');
    const post = () => request(app.getHttpServer()).post(`/api/v1/auth/saml/${orgSlug}/callback`).type('form').send({ SAMLResponse: signed });
    const results = await Promise.all([post(), post(), post()]);
    expect(results.filter((r) => codeOf(r)).length).toBe(1);
  });

  it('an IdP not trusted for MFA gets no AAL2 from its own MFA claim', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/security/identity-providers/${firstProviderId}`)
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .send({ mfaTrusted: false })
      .expect(200);
    const response = await callback('alice@ci-saml.test', { authnContextClassRef: 'http://schemas.microsoft.com/claims/multipleauthn' });
    const login = await exchange(codeOf(response)).expect(200);
    expect(await sessionOf(login.body.accessToken)).toEqual(expect.objectContaining({ assuranceLevel: 'aal1', mfaMethod: null }));
    await request(app.getHttpServer())
      .patch(`/api/v1/security/identity-providers/${firstProviderId}`)
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .send({ mfaTrusted: true })
      .expect(200);
  });

  it('a response signed with another key is refused, and the failure is a login event', async () => {
    const other = await generate([{ name: 'commonName', value: 'attacker.example.com' }]);
    const response = await callback('alice@ci-saml.test', { key: other.private });
    expect(response.headers.location).toContain('ssoError=invalid_response');
    const event = await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.loginEvent.findFirst({ where: { organizationId: orgId, method: 'saml', result: 'failed' }, orderBy: { createdAt: 'desc' } }),
    );
    expect(event?.reason).toBe('saml_invalid_response');
  });

  describe('a second SAML IdP for other.test, with JIT', () => {
    let secondProviderId: string;

    beforeAll(async () => {
      const second = await request(app.getHttpServer())
        .post('/api/v1/security/identity-providers')
        .set('Authorization', `Bearer ${orgAdminAccessToken}`)
        .send({
          type: 'saml',
          name: 'Second IdP',
          status: 'active',
          samlEntityId: 'second-idp',
          samlSsoUrl: 'https://second-idp.example.com/sso',
          samlCertificate: testIdp.cert,
          domains: ['other.test'],
          jitEnabled: true,
          jitRole: 'panel',
        })
        .expect(201);
      secondProviderId = second.body.id;
    });

    it('sign-in is routed by email domain; the old provider-less login link no longer guesses', async () => {
      const start = await request(app.getHttpServer()).post('/api/v1/auth/sso/start').send({ organizationSlug: orgSlug, email: 'bo@other.test' }).expect(200);
      expect(start.body.url).toContain(`RelayState=${secondProviderId}`);

      const loginUrl = new URL(start.body.url);
      const login = await request(app.getHttpServer()).get(loginUrl.pathname + loginUrl.search);
      expect(login.status).toBe(302);
      expect(login.headers.location).toMatch(/^https:\/\/second-idp\.example\.com\/sso\?SAMLRequest=/);

      // Two SAML IdPs and no RelayState: refused, not guessed.
      expect((await callback('alice@ci-saml.test')).headers.location).toContain('ssoError=invalid_response');
      await request(app.getHttpServer()).post('/api/v1/auth/sso/start').send({ organizationSlug: orgSlug, email: 'bo@unknown.test' }).expect(404);
    });

    it('JIT creates a new account at other.test in the non-sensitive role; the IdP cannot speak for other domains', async () => {
      const jit = await callback('newbie@other.test', { issuer: 'second-idp', relayState: secondProviderId });
      expect(codeOf(jit)).toEqual(expect.any(String));
      const created = await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
        tx.user.findFirstOrThrow({ where: { organizationId: orgId, email: 'newbie@other.test' } }),
      );
      expect(created.role).toBe('panel');

      // ci-saml.test belongs to the first provider, not this one: refused.
      const foreign = await callback('alice@ci-saml.test', { issuer: 'second-idp', relayState: secondProviderId });
      expect(foreign.headers.location).toContain('ssoError=not_provisioned');
      // The first IdP cannot sign in or create anyone at other.test, which the second owns.
      const crossed = await callback('another@other.test', { relayState: firstProviderId });
      expect(crossed.headers.location).toContain('ssoError=not_provisioned');
      await expect(
        tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.user.count({ where: { email: 'another@other.test' } })),
      ).resolves.toBe(0);
    });

    it('RelayState cannot point a response at a provider whose entity ID it does not carry', async () => {
      const response = await callback('newbie@other.test', { issuer: 'test-idp', relayState: secondProviderId });
      expect(response.headers.location).toContain('ssoError=not_provisioned');
    });

    it('JIT refuses to be configured with an admin role or a role holding sensitive permissions', async () => {
      for (const jitRole of ['org_admin', 'recruiter']) {
        await request(app.getHttpServer())
          .patch(`/api/v1/security/identity-providers/${secondProviderId}`)
          .set('Authorization', `Bearer ${orgAdminAccessToken}`)
          .send({ jitRole })
          .expect(400);
      }
    });
  });
});
