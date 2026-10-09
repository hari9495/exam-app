import { PrismaClient } from '@prisma/client';
import { seedServiceDeskSla } from './seed-service-desk-sla';

// Adds the batch-2 Service Desk demo (SLA policies, codes, template, near-breach ticket) to an already seeded database
// without running the whole seed again: npx ts-node prisma/seed-service-desk-sla.run.ts
const prisma = new PrismaClient();
prisma
  .$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
    const org = await tx.organization.findUniqueOrThrow({ where: { slug: 'demo-org' }, select: { id: true } });
    await seedServiceDeskSla(tx, org.id);
  }, { timeout: 60000 })
  .then(() => console.log('Service Desk batch-2 demo seeded'))
  .finally(() => prisma.$disconnect());
