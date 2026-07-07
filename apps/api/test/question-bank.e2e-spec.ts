import { Test } from '@nestjs/testing';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/prisma/tenant-prisma.service';
import { PrismaModule } from '../src/prisma/prisma.module';
import { randomUUID } from 'crypto';

describe('Question Bank Row-Level Security', () => {
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
      data: { name: `qb-rls-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const orgA = await prisma.organization.create({ data: { name: 'QB Org A', slug: `qb-org-a-${randomUUID()}`, planId } });
    const orgB = await prisma.organization.create({ data: { name: 'QB Org B', slug: `qb-org-b-${randomUUID()}`, planId } });
    orgAId = orgA.id;
    orgBId = orgB.id;

    await tenantPrisma.forTenant({ organizationId: orgAId, isSuperAdmin: false }, (tx) =>
      tx.question.create({
        data: {
          organizationId: orgAId,
          type: 'true_false',
          text: 'Org A question',
          difficulty: 'easy',
          marks: 1,
          createdBy: randomUUID(),
          options: { create: [{ text: 'True', isCorrect: true, orderIndex: 0 }, { text: 'False', isCorrect: false, orderIndex: 1 }] },
        },
      }),
    );
  });

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: orgAId, isSuperAdmin: false }, (tx) =>
      tx.question.deleteMany({ where: { organizationId: orgAId } }),
    );
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await prisma.plan.delete({ where: { id: planId } });
    await prisma.$disconnect();
  });

  it('never returns another tenant\'s questions', async () => {
    const orgBQuestions = await tenantPrisma.forTenant({ organizationId: orgBId, isSuperAdmin: false }, (tx) =>
      tx.question.findMany(),
    );
    expect(orgBQuestions).toHaveLength(0);
  });

  it('returns zero rows when no tenant context has been set', async () => {
    const rows = await prisma.question.findMany({ where: { organizationId: orgAId } });
    expect(rows).toHaveLength(0);
  });
});
