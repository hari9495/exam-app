import { PrismaClient } from '@prisma/client';
import { weightedScore } from '../../src/interviewing/scorecard-rules';

// Demo scorecard (Kaveri Foods, demo-org; founder 9 Nov 2026): the demo had no submitted scorecard, so scorecard comments
// (answer 322) could not be seen. Gives the one demo interview a scorecard template and the panellist's (recruiter@)
// submitted scorecard, scored with the app's own rule. hr-tester (Recruiter) can then read it and comment. Adds only;
// each write is audited as coming from this script. Safe to run again. Run from apps/api:
//   npx ts-node --transpile-only prisma/scripts/demo-scorecard.ts
const prisma = new PrismaClient();
const ITEMS = [
  { label: 'Process knowledge', weight: 40, rating: 4, notes: 'Explained the line changeover steps clearly.' },
  { label: 'Problem solving', weight: 35, rating: 3, notes: 'Good root-cause steps; slow on the second case.' },
  { label: 'Communication', weight: 25, rating: 4, notes: null },
];

(async () => {
  const log: string[] = [];
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
    const org = (await tx.organization.findUniqueOrThrow({ where: { slug: 'demo-org' }, select: { id: true } })).id;
    await tx.$executeRaw`SELECT set_config('app.current_org', ${org}, true)`;
    const audit = (action: string, type: string, id: string, meta: object) =>
      tx.$executeRaw`INSERT INTO audit_logs (id, organization_id, action, entity_type, entity_id, metadata_json, created_at)
        VALUES (gen_random_uuid(), ${org}::uuid, ${action}, ${type}, ${id}, ${JSON.stringify({ ...meta, source: 'demo set-up script, founder 9 Nov 2026' })}, now())`;
    const iv = await tx.interview.findFirst({ where: { organizationId: org, status: { not: 'cancelled' } }, orderBy: { createdAt: 'asc' }, include: { panelists: true } });
    if (!iv) throw new Error('demo-org has no interview.');
    const panelist = iv.panelists[0];
    if (!panelist) throw new Error('The demo interview has no panellist.');
    let templateId = iv.scorecardTemplateId;
    if (!templateId) {
      const t = await tx.scorecardTemplate.create({ data: { organizationId: org, name: 'Plant engineer · round 1', scaleMax: 5, passBar: 3, items: { create: ITEMS.map((i, k) => ({ organizationId: org, position: k, label: i.label, weight: i.weight })) } } });
      await tx.interview.update({ where: { id: iv.id }, data: { scorecardTemplateId: t.id } });
      await audit('ats.scorecard_template.created', 'scorecard_template', t.id, { items: ITEMS.length, passBar: 3, interviewId: iv.id });
      templateId = t.id;
      log.push(`template "${t.name}" added to interview ${iv.id}`);
    }
    if (await tx.scorecard.findFirst({ where: { interviewId: iv.id, panelistUserId: panelist.userId } })) return void log.push('scorecard already there, nothing to do');
    const items = await tx.scorecardItem.findMany({ where: { templateId }, orderBy: { position: 'asc' } });
    const ratings = items.map((it) => ({ itemId: it.id, rating: ITEMS.find((i) => i.label === it.label)?.rating ?? 3, notes: ITEMS.find((i) => i.label === it.label)?.notes ?? null }));
    const score = weightedScore(items, ratings);
    if (score == null) throw new Error('Every item needs a rating.');
    // Draft with its ratings first, then submit: the table refuses any change once a scorecard is submitted.
    const draft = await tx.scorecard.create({ data: { organizationId: org, interviewId: iv.id, panelistUserId: panelist.userId, templateId: templateId!, ratings: { create: ratings.map((r) => ({ organizationId: org, ...r })) } } });
    const sc = await tx.scorecard.update({ where: { id: draft.id }, data: { status: 'submitted', recommendation: 'yes', summary: 'Solid on the line basics; worth a plant visit round.', weightedScore: score, passes: score >= 3, submittedAt: new Date() } });
    await audit('ats.scorecard.submitted', 'interview', iv.id, { score, passes: score >= 3, scorecardId: sc.id });
    log.push(`submitted scorecard ${sc.id} (score ${score}) on interview ${iv.id}`);
  });
  console.log(log.join('\n'));
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e.message); await prisma.$disconnect(); process.exit(1); });
