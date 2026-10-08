import { PrismaClient } from '@prisma/client';
import { seedServiceDeskChannels } from './seed-service-desk-channels';

// Adds the batch-3 Service Desk demo (support addresses, the Customer Care desk, its portal, customers and banners) to an
// already seeded database without running the whole seed again: npx ts-node prisma/seed-service-desk-channels.run.ts
const prisma = new PrismaClient();
prisma
  .$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
    const org = await tx.organization.findUniqueOrThrow({ where: { slug: 'demo-org' }, select: { id: true } });
    await seedServiceDeskChannels(tx, org.id);
  }, { timeout: 60000 })
  .then(() => console.log('Service Desk batch-3 demo seeded'))
  .finally(() => prisma.$disconnect());
