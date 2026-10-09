import { PrismaClient } from '@prisma/client';
import { seedServiceDeskEsm3 } from './seed-service-desk-esm3';

// Adds the 3b-2 batch-3 Service Desk demo (WhatsApp, SMS and Teams lines on IT, Arjun's linked phone, shifts, the
// forecast history, a widget) to an already seeded database: npx ts-node prisma/seed-service-desk-esm3.run.ts
const prisma = new PrismaClient();
prisma
  .$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
      const org = await tx.organization.findUniqueOrThrow({ where: { slug: 'demo-org' }, select: { id: true } });
      await seedServiceDeskEsm3(tx, org.id);
    },
    { timeout: 60000 },
  )
  .then(() => console.log('Service Desk 3b-2 batch-3 demo seeded'))
  .finally(() => prisma.$disconnect());
