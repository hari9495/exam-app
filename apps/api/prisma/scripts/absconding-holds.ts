import { PrismaClient } from '@prisma/client';

// One-off for databases whose absconding timelines passed day 3 before the salary hold was wired to payroll
// (25 Oct 2026): each running timeline whose hold step is done gets its payroll hold (reason absconding) and the
// step's old note ("payroll holds come with M03") is replaced. Safe to run again. Run from apps/api:
//   npx ts-node prisma/scripts/absconding-holds.ts
const prisma = new PrismaClient();
(async () => {
  const out = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
    const org = (await tx.organization.findUniqueOrThrow({ where: { slug: 'demo-org' }, select: { id: true } })).id;
    await tx.$executeRaw`SELECT set_config('app.current_org', ${org}, true)`;
    const entities = (await tx.legalEntity.findMany({ where: { organizationId: org }, select: { id: true } })).map((e) => e.id);
    await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${entities.join(',')}}`}, true)`;
    const lines: string[] = [];
    for (const t of await tx.abscondingTimeline.findMany({ where: { organizationId: org, status: 'running' } })) {
      const steps = t.steps as unknown as { key: string; dueOn: string; doneAt: string | null; note?: string }[];
      const hold = steps.find((s) => s.key === 'hold');
      if (!hold?.doneAt) continue;
      const e = await tx.employment.findFirstOrThrow({ where: { organizationId: org, id: t.employmentId } });
      const open = await tx.payrollWithhold.findFirst({ where: { organizationId: org, employmentId: e.id, releasedAt: null } });
      const first = new Date(t.lastPresentOn.getTime() + 86_400_000).toISOString().slice(0, 10);
      if (!open) await tx.payrollWithhold.create({ data: { organizationId: org, legalEntityId: e.legalEntityId, employeeId: t.employeeId, employmentId: e.id, reasonCode: 'absconding', trigger: 'exit', note: `Absent without leave since ${first}` } });
      hold.note = `Salary on hold in payroll from ${hold.dueOn}. HR and the manager were told.`;
      await tx.abscondingTimeline.update({ where: { id: t.id }, data: { steps: steps as unknown as object } });
      lines.push(`${t.employeeId}: ${open ? 'hold already there' : 'hold added'}`);
    }
    return lines;
  });
  console.log(`${out.length} timeline(s):\n${out.join('\n')}`);
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
