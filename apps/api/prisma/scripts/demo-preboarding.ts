import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { BlobStorageService, OrgSecretsCryptoService } from '@exam-platform/shared';
import { FileStore, sha256 } from '../../src/documents/file-store';
import { buildDocx, templateFields } from '../../src/documents/letters/docx';
import { STARTER_LETTERS } from '../../src/documents/letters/fields';
import { dueOn, openable, type TaskStatus } from '../../src/lifecycle/journey-rules';

// Demo data for walking PPL-15 pre-boarding actions as HR (Kaveri Foods, demo-org), fictional throughout:
//   three direct joiners 10 to 20 days out (Reneged, Withdraw offer, Change joining date), one whose joining day was two
//   days ago and who never joined (Did not join), and one from Hiring: a filled requisition on an approved headcount-plan
//   slot, the candidate Hired with an accepted offer, not yet started (People › Onboarding › Ready to onboard). Withdraw
//   on that joiner moves the candidate out of Hired, reopens the requisition and frees the slot. The YukthiX "Offer
//   withdrawal letter" starter is switched on. Safe to run again. Run from apps/api (DATABASE_URL picks the database):
//   npx ts-node --transpile-only prisma/scripts/demo-preboarding.ts
const prisma = new PrismaClient();
type Tx = Prisma.TransactionClient;

const istToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const asDate = (d: string) => new Date(`${d}T00:00:00Z`);
const plus = (days: number) => new Date(asDate(istToday()).getTime() + days * 86_400_000).toISOString().slice(0, 10);

(async () => {
  const log: string[] = [];
  await prisma.$transaction(
    async (tx: Tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
      const org = (await tx.organization.findUniqueOrThrow({ where: { slug: 'demo-org' }, select: { id: true } })).id;
      await tx.$executeRaw`SELECT set_config('app.current_org', ${org}, true)`;
      const o = { organizationId: org };
      const hr = (await tx.user.findFirst({ where: { ...o, email: 'hr-tester@demo-org.test' } })) ?? (await tx.user.findFirstOrThrow({ where: { ...o, email: 'hr@demo-org.test' } }));
      const by = <T extends { id: string }>(what: string, row: T | null) => {
        if (!row) throw new Error(`${what} is not in the demo company.`);
        return row.id;
      };
      const loc = async (code: string) => tx.location.findFirstOrThrow({ where: { ...o, code } });
      const dept = async (code: string) => by(`Department ${code}`, await tx.department.findFirst({ where: { ...o, code }, select: { id: true } }));
      const desig = async (code: string) => by(`Designation ${code}`, await tx.designation.findFirst({ where: { ...o, code }, select: { id: true } }));
      const perm = by('Employment type PERM', await tx.employmentType.findFirst({ where: { ...o, code: 'PERM' }, select: { id: true } }));
      const template = await tx.journeyTemplate.findFirst({ where: { ...o, kind: 'onboarding', active: true, legalEntityId: null }, orderBy: { createdAt: 'asc' } });
      if (!template) throw new Error('The demo company has no active onboarding checklist.');
      const tasks = await tx.journeyTemplateTask.findMany({ where: { ...o, templateId: template.id }, orderBy: { sortOrder: 'asc' } });

      // A direct joiner with their onboarding checklist, as People › Onboarding › Add joiner makes one.
      const joiner = async (given: string, joining: string, place: { location: string; dept: string; desig: string }, offerId: string | null = null, email = `${given.toLowerCase()}.sample@example.test`, phone = '+919845000000') => {
        const had = await tx.person.findFirst({ where: { ...o, givenName: given, familyName: 'Sample' } });
        if (had && (await tx.preboarding.findFirst({ where: { ...o, personId: had.id } }))) return;
        const l = await loc(place.location);
        const person = had ?? (await tx.person.create({ data: { ...o, givenName: given, familyName: 'Sample', primaryEmail: email, primaryPhone: phone, createdBy: hr.id } }));
        const pb = await tx.preboarding.create({
          data: { ...o, personId: person.id, source: offerId ? 'offer' : 'direct', offerId, joiningOn: asDate(joining), legalEntityId: l.legalEntityId, locationId: l.id, departmentId: await dept(place.dept), designationId: await desig(place.desig), employmentTypeId: perm, hrOwnerUserId: hr.id, status: 'invited', createdBy: hr.id },
        });
        await tx.personRole.create({ data: { ...o, personId: person.id, roleType: 'preboarder', sourceTable: 'preboardings', sourceId: pb.id, startOn: asDate(istToday()) } });
        const j = await tx.journey.create({ data: { ...o, kind: 'onboarding', personId: person.id, subjectType: 'preboarding', subjectId: pb.id, templateId: template.id, templateVersion: template.version, anchorOn: asDate(joining), status: 'active', ownerUserId: hr.id } });
        const status = openable(tasks.map((x) => ({ key: x.key, dueOffsetDays: x.dueOffsetDays, dependsOn: x.dependsOn, required: x.required, status: 'waiting' as TaskStatus })));
        for (const x of tasks) {
          const assignee = x.ownerType === 'user' ? x.ownerUserId : x.ownerType === 'person' ? null : x.ownerGroupId ? null : hr.id;
          await tx.journeyTask.create({
            data: { ...o, journeyId: j.id, key: x.key, title: x.title, kind: x.kind, config: x.config as Prisma.InputJsonValue, ownerType: x.ownerType, assigneeUserId: assignee, assigneeGroupId: x.ownerGroupId, dueOffsetDays: x.dueOffsetDays, dueOn: asDate(dueOn(joining, x.dueOffsetDays)), dependsOn: x.dependsOn, required: x.required, locked: x.locked, sortOrder: x.sortOrder, status: status.get(x.key) ?? 'open' },
          });
        }
        log.push(`joiner ${given} Sample, joining ${joining} (${place.location})`);
      };

      // (a) and (b): direct joiners for Reneged, Withdraw offer, Change joining date, and Did not join.
      await joiner('Meghna', plus(12), { location: 'BLR-HO', dept: 'QA', desig: 'QA-ANALYST' }, null, 'meghna.sample@example.test', '+919845012301');
      await joiner('Tarun', plus(15), { location: 'MAA-OFF', dept: 'SALES', desig: 'ACC-EXEC' }, null, 'tarun.sample@example.test', '+919845012302');
      await joiner('Pooja', plus(18), { location: 'HSR-PLT', dept: 'PROD', desig: 'OPERATOR' }, null, 'pooja.sample@example.test', '+919845012303');
      await joiner('Harish', plus(-2), { location: 'HSR-PLT', dept: 'PROD', desig: 'OPERATOR' }, null, 'harish.sample@example.test', '+919845012304');

      // (c) From Hiring: an approved headcount-plan slot, its requisition (filled, so closed), the candidate Hired and the
      // offer accepted. Left for HR to start from Ready to onboard.
      const email = 'nandini.sample@example.test';
      if (!(await tx.candidate.findFirst({ where: { ...o, email } }))) {
        const hosur = await loc('HSR-PLT');
        const prod = await dept('PROD');
        const sup = await desig('PROD-SUP');
        const fy = Number(istToday().slice(5, 7)) >= 4 ? Number(istToday().slice(0, 4)) : Number(istToday().slice(0, 4)) - 1;
        const plan = (await tx.headcountPlan.findFirst({ where: { ...o, departmentId: prod, fyStart: fy } })) ?? (await tx.headcountPlan.create({ data: { ...o, departmentId: prod, legalEntityId: hosur.legalEntityId, fyStart: fy, status: 'approved', note: 'Demo: Hosur plant supervisors', createdBy: hr.id } }));
        const line = await tx.headcountPlanLine.create({ data: { ...o, planId: plan.id, designationId: sup, locationId: hosur.id, count: 1, budget: new Prisma.Decimal(650000) } });
        const pipeline = await tx.pipeline.findFirstOrThrow({ where: { ...o, isDefault: true, deletedAt: null } });
        const hired = await tx.pipelineStatus.findFirstOrThrow({ where: { ...o, stage: { pipelineId: pipeline.id, category: 'hired' } } });
        const start = plus(14);
        const job = await tx.job.create({
          data: { ...o, title: 'Production Supervisor (Sample)', status: 'closed', closedAt: new Date(), createdById: hr.id, legalEntityId: hosur.legalEntityId, locationId: hosur.id, location: hosur.name, departmentId: prod, designationId: sup, headcountPlanLineId: line.id, requisitionReason: 'new', headcount: 1, budgetAmount: new Prisma.Decimal(650000), targetStart: asDate(start), employmentType: 'Permanent', pipelineId: pipeline.id },
        });
        const cand = await tx.candidate.create({ data: { ...o, email, name: 'Nandini Sample', phone: '+919845012305', globalStage: 'hired' } });
        const entry = await tx.pipelineEntry.create({ data: { ...o, jobId: job.id, candidateId: cand.id, enteredVia: 'manual', statusId: hired.id, assignedUserId: hr.id } });
        const sent = new Date(Date.now() - 3 * 86_400_000);
        await tx.offer.create({
          data: {
            ...o,
            pipelineEntryId: entry.id,
            candidateId: cand.id,
            compensation: 'Annual CTC ₹6,20,000 (fixed ₹5,40,000, variable ₹80,000)',
            startDate: new Date(`${start}T04:00:00Z`),
            expiresAt: new Date(sent.getTime() + 7 * 86_400_000),
            status: 'accepted',
            letterSubject: 'Offer of employment: Production Supervisor, Hosur plant',
            letterBody: 'Dear Nandini,\n\nWe are pleased to offer you the role of Production Supervisor at our Hosur plant, starting on your joining day.\n\nKaveri Foods',
            sentByUserId: hr.id,
            sentAt: sent,
            respondedAt: new Date(sent.getTime() + 86_400_000),
          },
        });
        log.push(`Hiring: Nandini Sample, accepted offer for Production Supervisor (Sample), start ${start} (Ready to onboard)`);
      }

      // (d) The offer withdrawal letter starter, switched on for the company.
      if (!(await tx.letterTemplate.findFirst({ where: { ...o, letterType: 'offer_withdrawal', status: 'active' } }))) {
        const l = STARTER_LETTERS.find((x) => x.letterType === 'offer_withdrawal');
        if (!l) throw new Error('The offer withdrawal starter letter is missing from this build.');
        const buf = buildDocx(l.paragraphs);
        const id = randomUUID();
        const store = new FileStore(new BlobStorageService(), new OrgSecretsCryptoService());
        const ref = await store.put(`org/${org}/letter-templates/${id}`, buf);
        await tx.file.create({ data: { id, ...o, area: 'letter-templates', storageRef: ref, fileName: `${l.letterType}.docx`, mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: buf.length, sha256: sha256(buf), scanStatus: 'clean', scanDetail: 'YukthiX starter', scannedAt: new Date(), uploadedBy: hr.id, uploadedVia: 'system' } });
        await tx.letterTemplate.create({ data: { ...o, letterType: l.letterType, name: l.name, source: 'starter', starterRevision: l.revision, fileId: id, fields: templateFields(buf), requiresApproval: l.requiresApproval, personSigns: l.personSigns, onePerPerson: l.onePerPerson, version: 1, status: 'active', previewViewedBy: hr.id, previewViewedAt: new Date(), createdBy: hr.id } });
        log.push('Offer withdrawal letter (starter) switched on');
      }
      log.unshift(`HR owner: ${hr.email}`);
    },
    { timeout: 60_000 },
  );
  console.log(log.length > 1 ? log.join('\n') : 'Nothing to add: the demo data is already there.');
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
