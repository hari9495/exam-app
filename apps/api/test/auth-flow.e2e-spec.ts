import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/prisma/tenant-prisma.service';

describe('Full Phase 0 flow: create org -> create user -> login -> protected route', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  let orgSlug: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `e2e-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;
  });

  afterAll(async () => {
    if (orgId) {
      await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    }
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('bootstraps a super-admin JWT, creates an org, creates a user in it, then logs in as that user', async () => {
    orgSlug = `e2e-org-${randomUUID()}`;

    // Seed a super admin directly (bypassing HTTP — the seed script is the real bootstrap path).
    // Must go through tenantPrisma.forTenant with isSuperAdmin:true so the session context
    // satisfies the real RLS block predicate on dbo.users (plain prisma.user.create() has no
    // session context set and is rejected by the same policy verified in
    // tenant-isolation.e2e-spec.ts).
    const superAdminPasswordHash = await argon2.hash('SuperPassw0rd!');
    const superAdmin = await tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.user.create({
        data: {
          email: `super-${randomUUID()}@platform.test`,
          passwordHash: superAdminPasswordHash,
          role: 'super_admin',
          organizationId: null,
        },
      }),
    );

    const superLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/staff/login')
      .send({ email: superAdmin.email, password: 'SuperPassw0rd!' })
      .expect(200);
    const superAccessToken = superLogin.body.accessToken;

    const createOrgResponse = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${superAccessToken}`)
      .send({ name: 'E2E Org', slug: orgSlug, region: 'us', planId })
      .expect(201);
    orgId = createOrgResponse.body.id;

    // An org_admin must exist to call /users — create one directly for this test's bootstrap,
    // mirroring what the seed script does for the demo org.
    const orgAdminPasswordHash = await argon2.hash('OrgAdminPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.user.create({
        data: { organizationId: orgId, email: 'admin@e2e-org.test', passwordHash: orgAdminPasswordHash, role: 'org_admin' },
      }),
    );

    const orgAdminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/staff/login')
      .send({ organizationSlug: orgSlug, email: 'admin@e2e-org.test', password: 'OrgAdminPassw0rd!' })
      .expect(200);
    const orgAdminAccessToken = orgAdminLogin.body.accessToken;

    const createUserResponse = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .send({ email: 'recruiter@e2e-org.test', password: 'RecruiterPassw0rd!', role: 'recruiter' })
      .expect(201);
    expect(createUserResponse.body.organizationId).toBe(orgId);

    const listUsersResponse = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .expect(200);
    expect(listUsersResponse.body.map((u: { email: string }) => u.email)).toEqual(
      expect.arrayContaining(['admin@e2e-org.test', 'recruiter@e2e-org.test']),
    );

    await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .send({ name: 'Should Fail', slug: `should-fail-${randomUUID()}`, region: 'us', planId })
      .expect(403);
  });
});
