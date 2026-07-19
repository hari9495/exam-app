import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { SamlCacheProvider } from '../src/auth/saml-cache.provider';
import { getTestIdp, buildSignedSamlResponse, TestIdp } from './fixtures/saml-test-idp';

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

  // The SamlStrategy config (see resolveOrgSamlConfig in saml.strategy.ts) sets
  // validateInResponseTo: ValidateInResponseTo.always -- so every ACS callback,
  // even ones that will be rejected for other reasons (e.g. not_provisioned),
  // requires a genuinely cached AuthnRequest ID or node-saml throws before ever
  // reaching SamlStrategy.validate(). This mints one directly through the same
  // real SamlCacheProvider (Redis-backed) the live AuthnRequest-generation path
  // uses, exactly mirroring what a real SP-initiated redirect would have cached.
  async function mintCachedRequestId(): Promise<string> {
    const requestId = `_${randomUUID()}`;
    await samlCacheProvider.saveAsync(requestId, new Date().toISOString());
    return requestId;
  }

  beforeAll(async () => {
    testIdp = await getTestIdp();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
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

    // Pre-provision the staff member who will "log in via SSO" -- this is
    // the exact same real POST /users flow a recruiter/org-admin would use.
    const recruiterHash = await argon2.hash(randomUUID());
    const recruiter = await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.user.create({ data: { organizationId: orgId, email: 'alice@ci-saml.test', passwordHash: recruiterHash, role: 'recruiter' } }),
    );
    preProvisionedUserId = recruiter.id;

    await request(app.getHttpServer())
      .patch('/api/v1/organizations/sso')
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .send({ samlIdpEntityId: 'test-idp', samlIdpSsoUrl: 'https://test-idp.example.com/sso', samlIdpCertificate: testIdp.cert })
      .expect(200);
    await request(app.getHttpServer())
      .patch('/api/v1/organizations/sso')
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .send({ samlEnabled: true })
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
      .forTenant({ organizationId: orgId, isSuperAdmin: true }, (tx) => tx.user.deleteMany({ where: { organizationId: orgId } }))
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
    const code = redirectUrl.searchParams.get('code');
    expect(code).toEqual(expect.any(String));

    const exchangeResponse = await request(app.getHttpServer()).post('/api/v1/auth/sso/exchange').send({ code }).expect(200);

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
});
