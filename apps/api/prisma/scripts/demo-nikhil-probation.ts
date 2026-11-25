import { PrismaClient } from '@prisma/client';

// One-off for the demo test database (23 Oct 2026): Nikhil Rao was seeded on probation without a probation plan, so he
// was missing from People > Probation. Adds the plan the app makes for a joiner on probation (start = joining day, end
// from the company's probation length, 6 months by default). Safe to run again. Run from apps/api:
//   npx ts-node prisma/scripts/demo-nikhil-probation.ts
const prisma = new PrismaClient();
(async () => {
  const out = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
    const org = (await tx.organization.findUniqueOrThrow({ where: { slug: 'demo-org' }, select: { id: true } })).id;
    await tx.$executeRaw`SELECT set_config('app.current_org', ${org}, true)`;
    const rows = await tx.$queryRaw<{ employment_id: string; joined: string }[]>`
      SELECT m.id AS employment_id, m.joined_on::text AS joined FROM employments m
      JOIN employees e ON e.id = m.employee_id JOIN persons p ON p.id = e.person_id
      JOIN employment_status_periods s ON s.employment_id = m.id AND s.valid_to IS NULL AND s.superseded_at IS NULL AND s.status = 'probation'
      WHERE m.organization_id = ${org}::uuid AND NOT EXISTS (SELECT 1 FROM probations pr WHERE pr.employment_id = m.id)`;
    for (const r of rows) {
      const [{ d }] = await tx.$queryRaw<{ d: string }[]>`SELECT ((${r.joined}::date + make_interval(months => 6))::date - 1)::text AS d`;
      const end = new Date(`${d}T00:00:00Z`);
      await tx.probation.create({ data: { organizationId: org, employmentId: r.employment_id, startOn: new Date(`${r.joined}T00:00:00Z`), originalEndOn: end, plannedEndOn: end } });
    }
    return `${rows.length} probation plan(s) added`;
  });
  console.log(out);
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
