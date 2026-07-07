import { Test } from '@nestjs/testing';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/prisma/tenant-prisma.service';
import { PrismaModule } from '../src/prisma/prisma.module';
import { randomUUID } from 'crypto';

describe('Tenant Row-Level Security', () => {
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgAId: string;
  let orgBId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule] }).compile();
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
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
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
