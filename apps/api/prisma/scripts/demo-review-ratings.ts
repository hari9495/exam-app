import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { STARTER_SCALE, STARTER_TEMPLATES } from '../../src/performance/starters';

// One-off for the demo test database (founder 22 Oct 2026): a released "FY 2025-26 annual review" for Kaveri Foods Pvt Ltd,
// so the annual increment's "By rating" has ratings to use. Adds the starter rating scale and templates first if missing.
// People without a manager are not rated (the wizard lists them as left out). Safe to run again.
// Run from apps/api:  npx ts-node prisma/scripts/demo-review-ratings.ts
const CYCLE = 'FY 2025-26 annual review';
const SCORES = [4, 3, 3, 2, 5, 3, 4, 3, 2, 3, 4];
const prisma = new PrismaClient();
(async () => {
  const out = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
      const org = (await tx.organization.findUniqueOrThrow({ where: { slug: 'demo-org' }, select: { id: true } })).id;
      await tx.$executeRaw`SELECT set_config('app.current_org', ${org}, true)`;
      if (await tx.reviewCycle.findFirst({ where: { organizationId: org, name: CYCLE } })) return 'Already there, nothing changed';
      let scale = await tx.ratingScale.findFirst({ where: { organizationId: org, starterKey: STARTER_SCALE.key } });
      if (!scale) {
        scale = await tx.ratingScale.create({ data: { organizationId: org, name: STARTER_SCALE.name, minValue: STARTER_SCALE.min, maxValue: STARTER_SCALE.max, step: STARTER_SCALE.step, starterKey: STARTER_SCALE.key } });
        await tx.ratingScaleLevel.createMany({ data: STARTER_SCALE.levels.map((l) => ({ organizationId: org, scaleId: scale!.id, value: l.value, label: l.label, description: l.description })) });
        await tx.ratingBand.createMany({ data: STARTER_SCALE.bands.map((b) => ({ organizationId: org, scaleId: scale!.id, fromScore: b.fromScore, toScore: b.toScore, label: b.label })) });
      }
      for (const t of STARTER_TEMPLATES) {
        if (await tx.reviewTemplate.findFirst({ where: { organizationId: org, starterKey: t.key }, select: { id: true } })) continue;
        const row = await tx.reviewTemplate.create({ data: { organizationId: org, familyId: randomUUID(), name: t.name, kind: t.kind, scaleId: scale.id, scoring: t.scoring, status: 'active', activatedAt: new Date(), starterKey: t.key } });
        for (const [i, s] of t.sections.entries()) {
          const sec = await tx.reviewTemplateSection.create({ data: { organizationId: org, templateId: row.id, seq: i + 1, kind: s.kind, title: s.title, weight: s.rated ? s.weight : 0, rated: s.rated, whoAnswers: [...new Set(s.whoAnswers)] } });
          if (s.questions.length) await tx.reviewTemplateQuestion.createMany({ data: s.questions.map((q, j) => ({ organizationId: org, sectionId: sec.id, seq: j + 1, text: q.text, answer: q.answer, required: true })) });
        }
      }
      const template = await tx.reviewTemplate.findFirstOrThrow({ where: { organizationId: org, kind: 'annual', status: 'active' } });
      const entity = await tx.legalEntity.findFirstOrThrow({ where: { organizationId: org, name: 'Kaveri Foods Pvt Ltd' }, select: { id: true } });
      const releasedAt = new Date('2026-05-15T06:00:00Z');
      const cycle = await tx.reviewCycle.create({ data: { organizationId: org, name: CYCLE, kind: 'annual', periodFrom: new Date('2025-04-01'), periodTo: new Date('2026-03-31'), templateId: template.id, scaleId: scale.id, stages: [{ key: 'self' }, { key: 'manager' }], eligibilityRules: { cutoffMonths: 3, rateLeavers: false }, status: 'released', launchedAt: new Date('2026-04-01T06:00:00Z'), releasedAt } });
      const people = await tx.$queryRaw<{ employee_id: string; employment_id: string; manager_employee_id: string | null }[]>`
        SELECT DISTINCT ON (a.employee_id) a.employee_id, a.employment_id, a.manager_employee_id FROM employee_assignments a
        WHERE a.organization_id = ${org}::uuid AND a.legal_entity_id = ${entity.id}::uuid AND a.valid_to IS NULL ORDER BY a.employee_id, a.valid_from DESC`;
      const band = (s: number) => STARTER_SCALE.bands.find((b) => s >= b.fromScore && s <= b.toScore)!.label;
      let n = 0;
      for (const [i, p] of people.filter((x) => x.manager_employee_id).entries()) {
        const score = SCORES[i % SCORES.length];
        await tx.review.create({ data: { organizationId: org, cycleId: cycle.id, employeeId: p.employee_id, employmentId: p.employment_id, legalEntityId: entity.id, managerEmployeeId: p.manager_employee_id!, stage: 'done', status: 'released', finalScore: score, band: band(score), releasedAt } });
        n++;
      }
      return `Added "${CYCLE}" with ${n} released ratings (${people.length - n} without a manager left unrated)`;
    },
    { timeout: 120000 },
  );
  console.log(out);
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
