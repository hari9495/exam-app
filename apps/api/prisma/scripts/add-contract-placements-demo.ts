import { PrismaClient } from '@prisma/client';
import { seedWorkforceRoles } from '../seed-workforce-roles';

// One-off for an already seeded database (founder decision 21 Oct 2026): gives demo-org's HR Admin the contract worker
// and placement keys (the Plant HR Executive the contract worker view key), and adds the demo contractors, licences, contract workers
// and placements, each only when missing. Safe to run again. Run the migrations first, then from apps/api:
//   npx ts-node prisma/scripts/add-contract-placements-demo.ts
const prisma = new PrismaClient();
(async () => {
  const done = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
      const org = await tx.organization.findUniqueOrThrow({ where: { slug: 'demo-org' }, select: { id: true } });
      return seedWorkforceRoles(tx, org.id);
    },
    { timeout: 120000 },
  );
  console.log(done.length ? `Added: ${done.join('; ')}` : 'Nothing to add: the contract workers and placements demo is already there.');
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
