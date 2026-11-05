import { PrismaClient } from '@prisma/client';

// Demo lists for Helpdesk (Kaveri Foods, demo-org; founder 5 Nov 2026): the speak-up, safety and industrial relations
// lists start empty, so speak-up, accident and dispute reports were refused in the demo. Fill them with the people the
// manual tests use (MT-HLP-06-01, MT-HLP-12-01, MT-HLP-13-01). Adds only, never removes; each add is audited as coming
// from this script. murugan@ was deactivated, so compliance@ stands in on Escalation and the outside adviser
// consultant@sharma-advisory.test as the IR team's outside lawyer. Safe to run again. Run from apps/api:
//   npx ts-node --transpile-only prisma/scripts/demo-speakup-lists.ts
const prisma = new PrismaClient();
const LISTS: { team: string; email: string; role: 'member' | 'presiding' | 'external' }[] = [
  { team: 'ethics', email: 'it-lead@demo-org.test', role: 'member' },
  { team: 'ethics', email: 'kiran@demo-org.test', role: 'member' },
  { team: 'ic', email: 'plant-hr@demo-org.test', role: 'presiding' },
  { team: 'escalation', email: 'compliance@demo-org.test', role: 'member' },
  { team: 'safety', email: 'admin-tester@demo-org.test', role: 'member' },
  { team: 'ir', email: 'it-lead@demo-org.test', role: 'member' },
  { team: 'ir', email: 'kiran@demo-org.test', role: 'member' },
  { team: 'ir', email: 'consultant@sharma-advisory.test', role: 'external' },
];

(async () => {
  const log: string[] = [];
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
    const org = (await tx.organization.findUniqueOrThrow({ where: { slug: 'demo-org' }, select: { id: true } })).id;
    await tx.$executeRaw`SELECT set_config('app.current_org', ${org}, true)`;
    for (const l of LISTS) {
      const user = await tx.user.findFirst({ where: { organizationId: org, email: l.email, status: 'active' }, select: { id: true } });
      if (!user) throw new Error(`${l.email} is not an active person in demo-org.`);
      if (await tx.speakupTeamMember.findFirst({ where: { organizationId: org, team: l.team, userId: user.id, removedAt: null } })) continue;
      if (l.role === 'presiding' && (await tx.speakupTeamMember.findFirst({ where: { organizationId: org, team: 'ic', role: 'presiding', removedAt: null } }))) {
        log.push(`ic: a presiding officer is already set, ${l.email} skipped`);
        continue;
      }
      const m = await tx.speakupTeamMember.create({ data: { organizationId: org, team: l.team, userId: user.id, role: l.role } });
      const meta = JSON.stringify({ team: l.team, userId: user.id, role: l.role, source: 'demo set-up script, founder 5 Nov 2026' });
      await tx.$executeRaw`INSERT INTO audit_logs (id, organization_id, action, entity_type, entity_id, metadata_json, created_at)
        VALUES (gen_random_uuid(), ${org}::uuid, 'speakup.team_member_added', 'speakup_team_member', ${m.id}, ${meta}, now())`;
      log.push(`${l.team}: added ${l.email} (${l.role})`);
    }
  });
  console.log(log.length ? log.join('\n') : 'Nothing to add: the demo lists are already there.');
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
