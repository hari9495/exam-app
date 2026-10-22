import { PrismaClient } from '@prisma/client';
import { seedEmployeeCustomFields } from './seed-employees';

// Adds the PPL-03 "Additional details" demo (three employee fields and Arjun's values) to an already seeded
// database; safe to run again: npx ts-node prisma/seed-employee-fields.run.ts
const prisma = new PrismaClient();
(async () => {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
    const org = await tx.organization.findUniqueOrThrow({ where: { slug: 'demo-org' }, select: { id: true } });
    await seedEmployeeCustomFields(tx, org.id);
  });
})()
  .then(() => console.log('Employee custom fields seeded'))
  .finally(() => prisma.$disconnect());
