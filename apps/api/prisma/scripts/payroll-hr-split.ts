import { PrismaClient } from '@prisma/client';
import { HR_PAY } from '../seed-org-structure';
import { PAYROLL_NOT_HR } from '../seed-pay';

// One-off for an already seeded database (founder decisions 21 Oct 2026), the same change the seed now makes:
// - demo-org's "Payroll Admin" profile loses the HR keys (job changes, adding people, probation, the annual increment);
// - demo-org's "HR Admin" profile (hr@, Lakshmi) gains the salary grant and pay ranges, so HR runs the increment.
// Safe to run again: a second run changes nothing.  Run from apps/api:  npx ts-node prisma/scripts/payroll-hr-split.ts
const prisma = new PrismaClient();
(async () => {
  const done = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
      const org = await tx.organization.findUniqueOrThrow({ where: { slug: 'demo-org' }, select: { id: true } });
      const out: string[] = [];
      const change = async (name: string, add: string[], remove: string[]) => {
        const p = await tx.permissionProfile.findFirst({ where: { organizationId: org.id, name } });
        if (!p) return out.push(`${name}: not found, nothing changed`);
        const before = JSON.parse(p.permissionsJson) as string[];
        const after = [...before.filter((k) => !remove.includes(k)), ...add.filter((k) => !before.includes(k))];
        if (after.length === before.length && after.every((k) => before.includes(k))) return out.push(`${name}: already up to date`);
        await tx.permissionProfile.update({ where: { id: p.id }, data: { permissionsJson: JSON.stringify(after) } });
        out.push(`${name}: removed [${before.filter((k) => remove.includes(k)).join(', ')}], added [${add.filter((k) => !before.includes(k)).join(', ')}]`);
      };
      await change('Payroll Admin', [], PAYROLL_NOT_HR);
      await change('HR Admin', HR_PAY, []);
      return out;
    },
    { timeout: 120000 },
  );
  console.log(done.join('\n'));
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
