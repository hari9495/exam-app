import { PrismaClient } from '@prisma/client';
import { seedServiceDeskKnowledge, seedYukthixSupport } from './seed-service-desk-knowledge';

// Adds the batch-4 Service Desk demo (help articles, a rated ticket, NPS, KPIs, a wall screen, and YukthiX's own
// support desk in the platform tenant) to an already seeded database: npx ts-node prisma/seed-service-desk-knowledge.run.ts
const prisma = new PrismaClient();
prisma
  .$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
      const org = await tx.organization.findUniqueOrThrow({ where: { slug: 'demo-org' }, select: { id: true, planId: true } });
      await seedServiceDeskKnowledge(tx, org.id);
      await seedYukthixSupport(tx, org.planId);
    },
    { timeout: 60000 },
  )
  .then(() => console.log('Service Desk batch-4 demo seeded'))
  .finally(() => prisma.$disconnect());
