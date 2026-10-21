import { PrismaClient } from '@prisma/client';
import { seedFinanceEmployees } from '../seed-employees';

// One-off for an already seeded database (founder decision 20 Oct 2026): gives Suresh Pillai (payroll@), Meena Raghavan
// (payroll-approver@) and Neha Joshi (finance@) of demo-org their employee records, only where missing. Safe to run
// again: a second run adds nothing.  Run from apps/api:  npx ts-node prisma/scripts/add-finance-employees.ts
const prisma = new PrismaClient();
(async () => {
  const added = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
      const org = await tx.organization.findUniqueOrThrow({ where: { slug: 'demo-org' }, select: { id: true } });
      return seedFinanceEmployees(tx, org.id);
    },
    { timeout: 120000 },
  );
  console.log(added.length ? `Added employee records for: ${added.join(', ')}` : 'Nothing to add: the finance employees are already there.');
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
