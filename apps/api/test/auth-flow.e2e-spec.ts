import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '@exam-platform/shared';
import { TenantPrismaService } from '@exam-platform/shared';

describe('Full Phase 0 flow: create org -> create user -> login -> protected route', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  let orgSlug: string;
  let superAdminId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    // OrganizationsService.create() now looks up a plan named 'trial' by name (not by a
    // caller-supplied planId) -- this must match that literal name for org creation to work.
    const plan = await prisma.plan.create({
      data: { name: 'trial', candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;
  });

  afterAll(async () => {
    // Deleting an Organization cascades to an implicit `UPDATE users SET organization_id = NULL`
    // for its attached users (ON DELETE SET NULL), which is itself gated by the RLS block
    // predicate on dbo.users. That predicate requires app_is_super_admin = 1 in
    // SESSION_CONTEXT, so the delete must go through tenantPrisma.forTenant with
    // isSuperAdmin: true — a plain prisma.organization.delete() has no session context set
    // and is rejected by the database, silently leaking orphaned rows (previously masked by
    // the .catch(() => undefined) below).
    //
    // The cascade only nulls out organization_id on the users row — it does not delete the
    // user. Left alone, these become permanent `(organization_id: NULL, email: ...)` rows.
    // Since this suite's org-admin/recruiter emails are fixed strings (not randomized per
    // run), a later run's own cleanup would then collide with this leftover on the
    // `users_organization_id_email_key` unique index (organizationId, email) when its own
    // cascade tries to null out the same email. So the users created under this org must be
    // deleted explicitly, before the organization is removed.
    //
    // refresh_tokens itself has no RLS policy, but it does have a plain FK (ON DELETE NO
    // ACTION) to users, so any refresh tokens issued to this org's users during login must be
    // deleted before the users themselves, or the user delete fails with a foreign key
    // violation. The `user: { organizationId: orgId }` relation filter below joins through
    // dbo.users, which IS covered by the RLS filter predicate — so even though refresh_tokens
    // has no policy of its own, this query still needs a super-admin session context or it
    // silently matches zero rows (same join-through-RLS-table gotcha as the user deletes).
    if (orgId) {
      await tenantPrisma
        .forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
          tx.refreshToken.deleteMany({ where: { user: { organizationId: orgId } } }),
        )
        .catch(() => undefined);
      await tenantPrisma
        .forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.user.deleteMany({ where: { organizationId: orgId } }))
        .catch(() => undefined);
      await tenantPrisma
        .forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.organization.delete({ where: { id: orgId } }))
        .catch(() => undefined);
    }
    // The bootstrap super_admin created at the top of the test (organizationId: null) is
    // never touched by the orgId cleanup above -- it isn't scoped to orgId, and the org's
    // own delete cascade only nulls out organization_id on ITS users, it doesn't reach a
    // user that was already null-org to begin with. Left alone, every run leaves one more
    // permanent `super-<uuid>@platform.test` row (plus the RefreshToken issued by its
    // login call) in the database -- this is exactly the leak that produced 196 stray
    // super_admin rows in the dev DB before this cleanup was added. Same forTenant
    // super-admin bypass as above: dbo.users' RLS filter predicate hides null-org rows
    // from an unscoped session, so both the refresh-token lookup (which joins through
    // users) and the user delete itself need it, or they silently match zero rows.
    if (superAdminId) {
      await tenantPrisma
        .forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.refreshToken.deleteMany({ where: { userId: superAdminId } }))
        .catch(() => undefined);
      await tenantPrisma
        .forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.user.deleteMany({ where: { id: superAdminId } }))
        .catch(() => undefined);
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
    superAdminId = superAdmin.id;

    const superLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/staff/login')
      .send({ email: superAdmin.email, password: 'SuperPassw0rd!' })
      .expect(200);
    const superAccessToken = superLogin.body.accessToken;

    // adminEmail is distinct from the org_admin created manually below -- POST /organizations
    // now creates its own locked first-admin account as part of org creation (a separate user
    // from this test's own bootstrap admin), so reusing the same email would collide on the
    // organizationId+email unique constraint.
    const createOrgResponse = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${superAccessToken}`)
      .send({ name: 'E2E Org', slug: orgSlug, region: 'us', adminEmail: `bootstrap-admin-${randomUUID()}@e2e-org.test` })
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
    expect(listUsersResponse.body.data.map((u: { email: string }) => u.email)).toEqual(
      expect.arrayContaining(['admin@e2e-org.test', 'recruiter@e2e-org.test']),
    );

    await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .send({ name: 'Should Fail', slug: `should-fail-${randomUUID()}`, region: 'us', planId })
      .expect(403);
  });
});
