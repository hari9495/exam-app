import { PrismaClient } from '@prisma/client';
import { seedServiceDeskEsm } from './seed-service-desk-esm';

// Adds the 3b-2 batch-1 Service Desk demo (catalogue, order guide, question library, a desk rule, Arjun's login and
// cost-centre owners) to an already seeded database: npx ts-node prisma/seed-service-desk-esm.run.ts
const prisma = new PrismaClient();
prisma
  .$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
      const org = await tx.organization.findUniqueOrThrow({ where: { slug: 'demo-org' }, select: { id: true } });
      await seedServiceDeskEsm(tx, org.id);
    },
    { timeout: 60000 },
  )
  .then(() => console.log('Service Desk 3b-2 batch-1 demo seeded'))
  .finally(() => prisma.$disconnect());
