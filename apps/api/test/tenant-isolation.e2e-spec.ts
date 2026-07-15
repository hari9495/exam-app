import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '@exam-platform/shared';
import { TenantPrismaService } from '@exam-platform/shared';
import { PrismaModule } from '@exam-platform/shared';
import { randomUUID } from 'crypto';

describe('Tenant Row-Level Security', () => {
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgAId: string;
  let orgBId: string;

  beforeAll(async () => {
    // Unlike every other e2e spec, this one doesn't import AppModule, so it never gets
    // AppModule's ConfigModule.forRoot() bootstrap that loads .env into process.env.
    // PrismaService reads DATABASE_URL straight from process.env with no ConfigModule
    // of its own, so without this the suite only passes when a sibling spec's AppModule
    // has already populated process.env earlier in the same Jest worker — flaky/order-
    // dependent when run in isolation. Load it here explicitly instead.
    const moduleRef = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: 'test-plan', candidateLimit: 100, aiCreditLimit: 10, proctoringMinutesLimit: 100 },
    });
    planId = plan.id;

    const orgA = await prisma.organization.create({
      data: { name: 'Org A', slug: `org-a-${randomUUID()}`, planId },
    });
    const orgB = await prisma.organization.create({
      data: { name: 'Org B', slug: `org-b-${randomUUID()}`, planId },
    });
    orgAId = orgA.id;
    orgBId = orgB.id;

    await tenantPrisma.forTenant({ organizationId: orgAId, isSuperAdmin: false }, (tx) =>
      tx.user.create({
        data: { organizationId: orgAId, email: 'admin@org-a.test', passwordHash: 'x', role: 'org_admin' },
      }),
    );
    await tenantPrisma.forTenant({ organizationId: orgBId, isSuperAdmin: false }, (tx) =>
      tx.user.create({
        data: { organizationId: orgBId, email: 'admin@org-b.test', passwordHash: 'x', role: 'org_admin' },
      }),
    );
  });

  afterAll(async () => {
    // Deleting an Organization cascades to an implicit `UPDATE users SET organization_id = NULL`
    // for its attached users (ON DELETE SET NULL), which is itself gated by the RLS block
    // predicate on dbo.users. That predicate requires app_is_super_admin = 1 in
    // SESSION_CONTEXT, so the delete must go through tenantPrisma.forTenant with
    // isSuperAdmin: true — a plain prisma.organization.deleteMany() has no session context
    // set and is rejected by the database, silently leaking orphaned rows.
    //
    // The cascade only nulls out organization_id on the users row — it does not delete the
    // user. Left alone, these become permanent `(organization_id: NULL, email: ...)` rows.
    // Since this suite's user emails are fixed strings (not randomized per run), a later run's
    // own cleanup would then collide with this leftover on the
    // `users_organization_id_email_key` unique index (organizationId, email) when its own
    // cascade tries to null out the same email. So the users this suite created must be
    // deleted explicitly, before the organizations are removed.
    await tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.user.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } }),
    );
    await tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } }),
    );
    await prisma.plan.delete({ where: { id: planId } });
    await prisma.$disconnect();
  });

  it('scopes results to the current tenant when a context is set', async () => {
    const orgAUsers = await tenantPrisma.forTenant({ organizationId: orgAId, isSuperAdmin: false }, (tx) =>
      tx.user.findMany({ where: { organizationId: orgAId } }),
    );
    expect(orgAUsers).toHaveLength(1);
    expect(orgAUsers[0].email).toBe('admin@org-a.test');
  });

  it('never returns another tenant\'s rows even if queried without a filter', async () => {
    const orgAUsers = await tenantPrisma.forTenant({ organizationId: orgAId, isSuperAdmin: false }, (tx) =>
      tx.user.findMany(),
    );
    expect(orgAUsers.every((u) => u.organizationId === orgAId)).toBe(true);
  });

  it('returns zero rows when no tenant context has been set', async () => {
    const rows = await prisma.user.findMany({ where: { organizationId: orgAId } });
    expect(rows).toHaveLength(0);
  });

  it('lets a super-admin context see rows across tenants', async () => {
    const allUsers = await tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.user.findMany({ where: { organizationId: { in: [orgAId, orgBId] } } }),
    );
    expect(allUsers).toHaveLength(2);
  });
});
