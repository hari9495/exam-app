import { Test } from '@nestjs/testing';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/prisma/tenant-prisma.service';
import { PrismaModule } from '../src/prisma/prisma.module';
import { randomUUID } from 'crypto';

describe('Exam Builder Row-Level Security', () => {
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
      data: { name: `eb-rls-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const orgA = await prisma.organization.create({ data: { name: 'EB Org A', slug: `eb-org-a-${randomUUID()}`, planId } });
    const orgB = await prisma.organization.create({ data: { name: 'EB Org B', slug: `eb-org-b-${randomUUID()}`, planId } });
    orgAId = orgA.id;
    orgBId = orgB.id;

    await tenantPrisma.forTenant({ organizationId: orgAId, isSuperAdmin: false }, (tx) =>
      tx.exam.create({ data: { organizationId: orgAId, title: 'Org A Exam', createdBy: randomUUID() } }),
    );
  });

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: orgAId, isSuperAdmin: false }, (tx) =>
      tx.exam.deleteMany({ where: { organizationId: orgAId } }),
    );
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await prisma.plan.delete({ where: { id: planId } });
    await prisma.$disconnect();
  });

  it('never returns another tenant\'s exams', async () => {
    const orgBExams = await tenantPrisma.forTenant({ organizationId: orgBId, isSuperAdmin: false }, (tx) =>
      tx.exam.findMany(),
    );
    expect(orgBExams).toHaveLength(0);
  });

  it('returns zero rows when no tenant context has been set', async () => {
    const rows = await prisma.exam.findMany({ where: { organizationId: orgAId } });
    expect(rows).toHaveLength(0);
  });
});
