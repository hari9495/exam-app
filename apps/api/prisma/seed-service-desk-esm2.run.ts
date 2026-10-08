import { PrismaClient } from '@prisma/client';
import { seedServiceDeskEsm2 } from './seed-service-desk-esm2';

// Adds the 3b-2 batch-2 Service Desk demo (starter packs, Admin and Facilities desks, the fire-drill schedule, a joiner,
// the IT chat queue) to an already seeded database: npx ts-node prisma/seed-service-desk-esm2.run.ts
const prisma = new PrismaClient();
prisma
  .$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
      const org = await tx.organization.findUniqueOrThrow({ where: { slug: 'demo-org' }, select: { id: true } });
      await seedServiceDeskEsm2(tx, org.id);
    },
    { timeout: 60000 },
  )
  .then(() => console.log('Service Desk 3b-2 batch-2 demo seeded'))
  .finally(() => prisma.$disconnect());
