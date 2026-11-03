import { PrismaClient } from '@prisma/client';

// Demo access for Expenses (Kaveri Foods, demo-org; founder 3 Nov 2026): the demo HR Admin role was edited earlier, so
// migration 20261530000000 left it alone; add the view-only expense policy key to it, so HR (hr-tester) sees the policy
// read-only. Adds only, never removes. Safe to run again. Run from apps/api:
//   npx ts-node --transpile-only prisma/scripts/demo-expenses.ts
const prisma = new PrismaClient();
const KEY = 'expense.policy.view';

(async () => {
  const log: string[] = [];
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
    const org = (await tx.organization.findUniqueOrThrow({ where: { slug: 'demo-org' }, select: { id: true } })).id;
    await tx.$executeRaw`SELECT set_config('app.current_org', ${org}, true)`;
    const role = await tx.permissionProfile.findFirst({ where: { organizationId: org, name: 'HR Admin' } });
    if (!role) throw new Error('The demo company has no "HR Admin" role.');
    const have = JSON.parse(role.permissionsJson) as string[];
    if (!have.includes(KEY)) {
      await tx.permissionProfile.update({ where: { id: role.id }, data: { permissionsJson: JSON.stringify([...have, KEY].sort()) } });
      log.push(`HR Admin: added ${KEY}`);
    }
  });
  console.log(log.length ? log.join('\n') : 'Nothing to add: the demo access is already there.');
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
