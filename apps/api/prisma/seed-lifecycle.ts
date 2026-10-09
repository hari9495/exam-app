import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { BlobStorageService, OrgSecretsCryptoService } from '@exam-platform/shared';
import { FileStore, sha256 } from '../src/documents/file-store';
import { buildDocx, templateFields } from '../src/documents/letters/docx';
import { STARTER_LETTERS } from '../src/documents/letters/fields';
import { STARTERS } from '../src/lifecycle/starters';
import { dueOn, openable, type TaskStatus } from '../src/lifecycle/journey-rules';

type Tx = Prisma.TransactionClient;

// M01 lifecycle batch 6a demo (Kaveri Foods): the company's onboarding and offboarding checklists copied from the
// YukthiX starters (IT and Admin tasks owned by an "IT and Admin team" group, the laptop task raising the IT desk's
// "New laptop" request), and Sneha Pillai joining the Hosur plant in Divya's team in ten days, with her checklist.
export const LIFE_PERMISSIONS = [
  { key: 'lifecycle.onboarding.view', description: 'See joiners, their onboarding checklists and progress for the people in scope' },
  { key: 'lifecycle.onboarding.manage', description: 'Add and import joiners, change their joining day, and run their onboarding checklists' },
  { key: 'lifecycle.journey.template.manage', description: 'Set up onboarding and offboarding checklist templates' },
  { key: 'document.view', description: 'See the documents of the people in scope (each document type still needs its data class)' },
  { key: 'document.manage', description: 'Ask people for documents, upload for them, and verify or reject documents in scope' },
  { key: 'lifecycle.bgv.manage', description: 'See and record background checks and the consent behind them for joiners in scope (Special data)' },
  { key: 'letter.template.manage', description: 'Upload, check and switch on Word letter templates' },
  { key: 'letter.issue', description: 'Issue letters to the people in scope (letter types that need approval go to the signatory first)' },
  { key: 'letter.signatory.manage', description: 'Name who signs letters for each legal entity and their signature image (needs a fresh second sign-in step)' },
  { key: 'lifecycle.exit.view', description: 'See the exit cases of the people in scope (never the HR-only facts)' },
  { key: 'lifecycle.exit.manage', description: 'Start company exits, accept resignations on the HR step, change last working days, set holds and clearance' },
  { key: 'lifecycle.exit.confidential.view', description: 'Read HR-only exit facts (open-case flags, rehire, hold reasons) and confidential exit interview answers' },
  { key: 'asset.view', description: 'See the company asset list and who holds what' },
  { key: 'asset.manage', description: 'Add assets, issue them to people and take them back' },
];

const istToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const asDate = (d: string) => new Date(`${d}T00:00:00Z`);

export async function seedLifecycle(tx: Tx, organizationId: string): Promise<void> {
  const org = { organizationId };
  if (await tx.journeyTemplate.findFirst({ where: { ...org, starterKey: 'onboarding_standard' } })) return;
  const hr = await tx.user.findFirstOrThrow({ where: { ...org, email: 'hr@demo-org.test' } });
  const itAgent = await tx.user.findFirst({ where: { ...org, email: 'it-agent@demo-org.test' } });
  const group = await tx.userGroup.upsert({ where: { organizationId_name: { organizationId, name: 'IT and Admin team' } }, update: {}, create: { ...org, name: 'IT and Admin team', description: 'Gets devices, accounts and seats ready for joiners (lifecycle checklists).' } });
  if (itAgent) await tx.userGroupMember.upsert({ where: { groupId_userId: { groupId: group.id, userId: itAgent.id } }, update: {}, create: { ...org, groupId: group.id, userId: itAgent.id } });
  await tx.$executeRaw`SELECT set_config('app.sd_system', 'on', true)`;
  const laptop = await tx.sdCatalogItem.findFirst({ where: { ...org, name: 'New laptop', state: 'published' } });

  const templateIds: Record<string, string> = {};
  for (const s of STARTERS) {
    const t = await tx.journeyTemplate.create({ data: { ...org, kind: s.kind, name: s.name.replace(' (starter)', ''), starterKey: s.key, active: true, createdBy: hr.id } });
    templateIds[s.key] = t.id;
    await tx.journeyTemplateTask.createMany({
      data: s.tasks.map((x, i) => ({
        ...org,
        templateId: t.id,
        key: x.key,
        title: x.title,
        ownerType: x.ownerType,
        ownerGroupId: x.ownerType === 'it' || x.ownerType === 'admin' ? group.id : null,
        kind: x.kind,
        config: (x.key === 'laptop' && laptop ? { itemId: laptop.id } : (x.config ?? {})) as Prisma.InputJsonValue,
        dueOffsetDays: x.dueOffsetDays,
        dependsOn: x.dependsOn ?? [],
        required: x.required ?? true,
        locked: Boolean(x.locked),
        sortOrder: i,
      })),
    });
  }

  // Sneha Pillai joins the Hosur plant in ten days, in Divya's production team.
  const hosur = await tx.location.findFirstOrThrow({ where: { ...org, code: 'HSR-PLT' } });
  const prod = await tx.department.findFirst({ where: { ...org, code: 'PROD' } });
  const op = await tx.designation.findFirst({ where: { ...org, code: 'PROD-SUP' } });
  const perm = await tx.employmentType.findFirst({ where: { ...org, code: 'PERM' } });
  const divya = await tx.employee.findFirst({ where: { ...org, workEmail: 'divya.raghunathan@kaverifoods.test' } });
  const joining = new Date(asDate(istToday()).getTime() + 10 * 86_400_000).toISOString().slice(0, 10);
  const person = await tx.person.create({ data: { ...org, givenName: 'Sneha', familyName: 'Pillai', primaryEmail: 'sneha.pillai@example.test', primaryPhone: '+919845011122', createdBy: hr.id } });
  const pb = await tx.preboarding.create({
    data: { ...org, personId: person.id, source: 'direct', joiningOn: asDate(joining), legalEntityId: hosur.legalEntityId, locationId: hosur.id, departmentId: prod?.id ?? null, designationId: op?.id ?? null, employmentTypeId: perm?.id ?? null, managerEmployeeId: divya?.id ?? null, hrOwnerUserId: hr.id, status: 'invited', createdBy: hr.id },
  });
  await tx.personRole.create({ data: { ...org, personId: person.id, roleType: 'preboarder', sourceTable: 'preboardings', sourceId: pb.id, startOn: asDate(istToday()) } });
  const tt = await tx.journeyTemplateTask.findMany({ where: { ...org, templateId: templateIds.onboarding_standard }, orderBy: { sortOrder: 'asc' } });
  const j = await tx.journey.create({ data: { ...org, kind: 'onboarding', personId: person.id, subjectType: 'preboarding', subjectId: pb.id, templateId: templateIds.onboarding_standard, templateVersion: 1, anchorOn: asDate(joining), status: 'active', ownerUserId: hr.id } });
  const status = openable(tt.map((x) => ({ key: x.key, dueOffsetDays: x.dueOffsetDays, dependsOn: x.dependsOn, required: x.required, status: 'waiting' as TaskStatus })));
  for (const x of tt) {
    const assignee = x.ownerType === 'manager' ? (divya?.userId ?? hr.id) : x.ownerGroupId ? null : hr.id;
    await tx.journeyTask.create({
      data: { ...org, journeyId: j.id, key: x.key, title: x.title, kind: x.kind, config: x.config as Prisma.InputJsonValue, ownerType: x.ownerType, assigneeUserId: assignee, assigneeGroupId: x.ownerGroupId, dueOffsetDays: x.dueOffsetDays, dueOn: asDate(dueOn(joining, x.dueOffsetDays)), dependsOn: x.dependsOn, required: x.required, locked: x.locked, sortOrder: x.sortOrder, status: status.get(x.key) ?? 'open' },
    });
  }
}

/**
 * Lifecycle 6b demo: the three YukthiX starter letters switched on for the whole company (their sample preview counted
 * as seen), and Lakshmi (HR) as the signatory of every legal entity, so HR can issue Sneha's appointment letter at once.
 */
export async function seedLifecycleLetters(tx: Tx, organizationId: string): Promise<void> {
  const org = { organizationId };
  const first = !(await tx.letterTemplate.findFirst({ where: org }));
  const hr = await tx.user.findFirstOrThrow({ where: { ...org, email: 'hr@demo-org.test' } });
  const store = new FileStore(new BlobStorageService(), new OrgSecretsCryptoService());
  // Every YukthiX starter the company does not have yet (later batches add starters, e.g. the 6d exit letters).
  for (const l of STARTER_LETTERS) {
    if (await tx.letterTemplate.findFirst({ where: { ...org, letterType: l.letterType } })) continue;
    const buf = buildDocx(l.paragraphs);
    const id = randomUUID();
    const ref = await store.put(`org/${organizationId}/letter-templates/${id}`, buf);
    await tx.file.create({ data: { id, ...org, area: 'letter-templates', storageRef: ref, fileName: `${l.letterType}.docx`, mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: buf.length, sha256: sha256(buf), scanStatus: 'clean', scanDetail: 'YukthiX starter', scannedAt: new Date(), uploadedBy: hr.id, uploadedVia: 'system' } });
    await tx.letterTemplate.create({ data: { ...org, letterType: l.letterType, name: l.name, source: 'starter', fileId: id, fields: templateFields(buf), requiresApproval: l.requiresApproval, personSigns: l.personSigns, version: 1, status: 'active', previewViewedBy: hr.id, previewViewedAt: new Date(), createdBy: hr.id } });
  }
  if (!first) return;
  for (const e of await tx.legalEntity.findMany({ where: org, select: { id: true } })) {
    await tx.signatory.create({ data: { ...org, legalEntityId: e.id, userId: hr.id, title: 'Head of HR', createdBy: hr.id } });
  }
}

/** Lifecycle 6c demo: the shared asset list (D3) with Divya's laptop issued to her, a phone and a card in stock. */
export async function seedLifecycleAssets(tx: Tx, organizationId: string): Promise<void> {
  const org = { organizationId };
  if (await tx.asset.findFirst({ where: org, select: { id: true } })) return;
  const hr = await tx.user.findFirst({ where: { ...org, email: 'hr@demo-org.test' } });
  const divyaUser = await tx.user.findFirst({ where: { ...org, email: 'panel@demo-org.test' } });
  const divya = divyaUser ? await tx.employee.findFirst({ where: { ...org, userId: divyaUser.id } }) : null;
  const entity = await tx.legalEntity.findFirst({ where: { ...org, isDefault: true } });
  const place = { legalEntityId: entity?.id ?? null, locationId: null };
  const add = (category: string, name: string, tag: string, cost: string, status = 'in_stock') =>
    tx.asset.create({ data: { ...org, ...place, category, name, tag, cost: new Prisma.Decimal(cost), purchasedOn: asDate('2026-04-01'), status, createdBy: hr?.id ?? null } });
  const laptop = await add('Laptop', 'Dell Latitude 5440', 'KF-LT-0001', '68500.00', divya ? 'assigned' : 'in_stock');
  await add('Phone', 'Samsung Galaxy A35', 'KF-PH-0001', '15000.00');
  await add('Access card', 'Hosur plant access card', 'KF-AC-0001', '300.00');
  if (divya) await tx.assetAssignment.create({ data: { ...org, assetId: laptop.id, personId: divya.personId, issuedOn: asDate('2026-04-06'), issueCondition: 'New, with charger and bag', issuedBy: hr?.id ?? null } });
}
