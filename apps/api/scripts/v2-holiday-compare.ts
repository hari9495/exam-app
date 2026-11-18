import { PrismaService } from '@exam-platform/shared';

// Answer 2510 (retiring /v2 Business hours): read-only. For each company, the holidays in the old /v2 holiday list
// (organizations.holidays_json) whose date is in none of the company's holiday calendars, and old business hours that
// did not fit the one 6.1 window (different hours on different days, or a time zone other than India time). Nothing is
// changed: the founder decides what to add to a calendar.
//   npx ts-node scripts/v2-holiday-compare.ts
async function main() {
  const prisma = new PrismaService();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
    const orgs = await tx.$queryRaw<{ id: string; name: string; slug: string; holidays: string | null; hours: string | null }[]>`
      SELECT id, name, slug, holidays_json AS holidays, business_hours_json AS hours FROM organizations
      WHERE (holidays_json IS NOT NULL AND holidays_json NOT IN ('', '[]')) OR (business_hours_json IS NOT NULL AND business_hours_json <> '')
      ORDER BY name`;
    let only = 0;
    for (const o of orgs) {
      const lines: string[] = [];
      const old = o.holidays ? (JSON.parse(o.holidays) as { date: string; name: string }[]) : [];
      if (old.length) {
        const inCalendars = await tx.$queryRaw<{ d: string; calendar: string }[]>`
          SELECT h.holiday_on::text AS d, c.name AS calendar FROM holidays h JOIN holiday_calendars c ON c.id = h.calendar_id
          WHERE h.organization_id = ${o.id}::uuid`;
        const dates = new Set(inCalendars.map((r) => r.d));
        for (const h of old.filter((x) => !dates.has(x.date)).sort((a, b) => a.date.localeCompare(b.date))) lines.push(`  only in the old list: ${h.date}  ${h.name}`);
        only += lines.length;
      }
      if (o.hours) {
        const bh = JSON.parse(o.hours) as { timeZone: string; days: Record<string, { enabled: boolean; open: string; close: string }> };
        const open = Object.entries(bh.days).filter(([, d]) => d.enabled);
        if (bh.timeZone !== 'Asia/Kolkata') lines.push(`  old hours were in ${bh.timeZone}; 6.1 uses India time`);
        if (new Set(open.map(([, d]) => `${d.open}-${d.close}`)).size > 1) lines.push(`  old hours differed by day (${open.map(([k, d]) => `${k} ${d.open}-${d.close}`).join(', ')}); 6.1 took the earliest opening and latest closing`);
        if (!open.length) lines.push('  old hours had no open day; 6.1 keeps its default (Mon-Fri 09:30-18:30)');
      }
      if (lines.length) console.log(`${o.name} (${o.slug})\n${lines.join('\n')}`);
    }
    console.log(`${orgs.length} companies with old /v2 hours or holidays; ${only} holiday dates only in the old list.`);
  });
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
