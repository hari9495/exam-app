import { PrismaClient } from '@prisma/client';
import { LIFE_PERMISSIONS, seedLifecycle, seedLifecycleAssets, seedLifecycleLetters } from './seed-lifecycle';

// Adds the lifecycle batch-6a demo (checklists from the starters, a joiner) to an already seeded database:
// npx ts-node prisma/seed-lifecycle.run.ts
const prisma = new PrismaClient();
(async () => {
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
      for (const p of LIFE_PERMISSIONS) await tx.permission.upsert({ where: { key: p.key }, update: {}, create: p });
      const org = await tx.organization.findUniqueOrThrow({ where: { slug: 'demo-org' }, select: { id: true } });
      await seedLifecycle(tx, org.id);
      await seedLifecycleLetters(tx, org.id);
      await seedLifecycleAssets(tx, org.id);
    },
    { timeout: 120000 },
  );
})()
  .then(() => console.log('Lifecycle 6a demo seeded'))
  .finally(() => prisma.$disconnect());
