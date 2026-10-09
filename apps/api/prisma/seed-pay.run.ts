import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import { seedAuditAnchor, seedPay, seedPay5b } from './seed-pay';

// Adds the payroll batch-5a and 5b demo (pay periods, a reopen request waiting for its second approver, a sample payslip and
// bank file, an audit anchor) to an already seeded database: npx ts-node prisma/seed-pay.run.ts
const prisma = new PrismaClient();
(async () => {
  const hash = await argon2.hash('Passw0rd!2026');
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
      const org = await tx.organization.findUniqueOrThrow({ where: { slug: 'demo-org' }, select: { id: true } });
      await seedPay(tx, org.id, hash);
      await seedPay5b(tx, org.id);
    },
    { timeout: 120000 },
  );
  // The anchor in its own transaction, after the demo's audit rows are committed.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
    const org = await tx.organization.findUniqueOrThrow({ where: { slug: 'demo-org' }, select: { id: true } });
    console.log(`audit chain checked: ${await seedAuditAnchor(tx, org.id)} rows`);
  });
})()
  .then(() => console.log('Payroll 5a demo seeded'))
  .finally(() => prisma.$disconnect());
