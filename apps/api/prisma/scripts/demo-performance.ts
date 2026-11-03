import { PrismaClient } from '@prisma/client';
import { ROLE_TEMPLATES } from '../../src/access/role-templates';

// Demo access for walking Performance as HR (Kaveri Foods, demo-org; founder 3 Nov 2026): the HR tester also gets the
// "Performance set-up" role from its template (set-up, goals, review cycles, calibration), so cycle set-up and the
// control room can be walked as HR. Granted company-wide by one admin and approved by another (P02 §4.6), as
// demo-people-gaps.ts does. Safe to run again. Run from apps/api:
//   npx ts-node --transpile-only prisma/scripts/demo-performance.ts
const prisma = new PrismaClient();

(async () => {
  const log: string[] = [];
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
    const org = (await tx.organization.findUniqueOrThrow({ where: { slug: 'demo-org' }, select: { id: true } })).id;
    await tx.$executeRaw`SELECT set_config('app.current_org', ${org}, true)`;
    const o = { organizationId: org };
    const user = async (...emails: string[]) => {
      for (const email of emails) {
        const u = await tx.user.findFirst({ where: { ...o, email }, select: { id: true, email: true } });
        if (u) return u;
      }
      throw new Error(`None of ${emails.join(', ')} is in the demo company.`);
    };
    const hr = await user('hr-tester@demo-org.test', 'hr@demo-org.test');
    const admin = await user('admin-tester@demo-org.test', 'admin@demo-org.test');
    const approver = await user(...['admin2@demo-org.test', 'admin@demo-org.test'].filter((e) => e !== admin.email));

    const template = ROLE_TEMPLATES.find((t) => t.key === 'performance_setup');
    if (!template) throw new Error('The performance_setup role template is missing.');
    const role = 'Performance set-up';
    const profile =
      (await tx.permissionProfile.findFirst({ where: { ...o, name: role } })) ??
      (await tx.permissionProfile.create({ data: { ...o, name: role, permissionsJson: JSON.stringify(template.permissions) } }));
    if (!(await tx.roleGrant.findFirst({ where: { ...o, userId: hr.id, permissionProfileId: profile.id, status: 'active' } }))) {
      const today = new Date().toISOString().slice(0, 10);
      await tx.roleGrant.create({
        data: { ...o, userId: hr.id, permissionProfileId: profile.id, scopeType: 'tenant', validFrom: new Date(`${today}T00:00:00Z`), status: 'active', reason: 'Demo: walk Performance cycles as HR', grantedBy: admin.id, decidedBy: approver.id, decidedAt: new Date() },
      });
      log.push(`${role} granted to ${hr.email}`);
    }
  });
  console.log(log.length ? log.join('\n') : 'Nothing to add: the demo access is already there.');
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
