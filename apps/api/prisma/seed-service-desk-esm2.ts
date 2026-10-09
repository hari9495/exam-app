import { Prisma } from '@prisma/client';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { EmployeeHistoryService } from '../src/employee-history/employee-history.service';
import { todayIst } from '../src/org-structure/org-validation';
import { addRole, personForEmployee } from '../src/people/persons';
import { installPack } from '../src/service-desk/desks.service';
import { nextRun } from '../src/service-desk/recurrence';
import { htmlToText, textToHtml } from '../src/service-desk/rich-text';
import { PRIVATE_BY_DEFAULT, starterFor, starterPriority } from '../src/service-desk/starter';

// Service Desk phase 3b-2 batch 2 demo for Kaveri Foods (fictional throughout):
//   - the desk role profiles gain the batch-2 keys (live chat, HR summary, move, lifecycles, chat set-up);
//   - starter packs on the HR desk (its M08 privacy: pay, medical and personal tickets are private) and two new ESM desks,
//     Admin (ADM) and Facilities (FAC), with their catalogue items and SLA targets; Farah (it-lead) works both;
//   - on Facilities, the recurring record "Monthly fire-drill check" (first Monday of the month, 10:00 India time);
//   - a joiner journey "New joiner at Kaveri Foods" and a new hire, Nikhil Rao, joining in a week: his requests on the
//     IT, Admin and Facilities desks with their tasks due before his first day;
//   - a live chat queue "IT chat" on the IT desk with a pre-chat question and a prompt on the help pages;
//   - Divya (panel@demo-org.test) has linked Microsoft Teams, so approval cards reach her (dev transport).
// Idempotent: skipped once the Facilities desk exists.

type Tx = Prisma.TransactionClient;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

export async function seedServiceDeskEsm2(tx: Tx, organizationId: string) {
  const org = { organizationId };
  await tx.$executeRaw`SELECT set_config('app.sd_system', 'on', true)`;
  const it = await tx.sdDesk.findFirst({ where: { ...org, key: 'IT' } });
  const hr = await tx.sdDesk.findFirst({ where: { ...org, key: 'HR' } });
  if (!it || !hr || (await tx.sdDesk.findFirst({ where: { ...org, key: 'FAC' } }))) return;
  const admin = await tx.user.findFirstOrThrow({ where: { ...org, email: 'admin@demo-org.test' } });
  const hrUser = await tx.user.findFirstOrThrow({ where: { ...org, email: 'hr@demo-org.test' } });
  const farah = await tx.user.findFirstOrThrow({ where: { ...org, email: 'it-lead@demo-org.test' } });
  const panel = await tx.user.findFirstOrThrow({ where: { ...org, email: 'panel@demo-org.test' } });
  const a = { ctx: { organizationId, isSuperAdmin: false }, userId: admin.id };

  // ---- the batch-2 keys on the desk role profiles ----
  for (const key of ['desk_agent', 'desk_lead', 'desk_admin', 'service_desk_admin']) {
    const t = ROLE_TEMPLATES.find((x) => x.key === key)!;
    await tx.permissionProfile.updateMany({ where: { ...org, name: t.name }, data: { permissionsJson: JSON.stringify(t.permissions) } });
  }

  // ---- SD-2.09: HR starter pack (M08 privacy on its sensitive categories) ----
  await installPack(tx, a, hr);

  // ---- SD-2.09: Admin and Facilities desks with their packs ----
  const desk = async (key: string, name: string, kind: string) => {
    const d = await tx.sdDesk.create({ data: { ...org, key, name, kind, billingClass: 'service_desk', calendarId: it.calendarId, numberPrefix: `${key}-`, createdBy: admin.id } });
    const w = { ...org, deskId: d.id };
    await tx.sdCounter.create({ data: { ...w, nextNumber: 1001 } });
    const s = starterFor(kind);
    await tx.sdTicketType.createMany({ data: s.types.map((t, i) => ({ ...w, kind: t.kind, name: t.name, sortOrder: i })) });
    await tx.sdStatus.createMany({ data: s.statuses.map((x, i) => ({ ...w, label: x.label, systemState: x.systemState, sortOrder: i })) });
    const group = await tx.sdGroup.create({ data: { ...w, name: `${name} team`, assignmentMethod: 'round_robin' } });
    await tx.sdCategory.createMany({ data: s.categories.map((c, i) => ({ ...w, name: c.name, sensitive: Boolean(c.sensitive), privateByDefault: PRIVATE_BY_DEFAULT.has(`${kind}:${c.name}`), defaultGroupId: group.id, sortOrder: i })) });
    await tx.sdPriorityMatrix.createMany({ data: [1, 2, 3, 4].flatMap((impact) => [1, 2, 3, 4].map((urgency) => ({ ...w, impact, urgency, priority: starterPriority(impact, urgency) }))) });
    await tx.sdDeskMember.create({ data: { ...w, userId: farah.id, role: 'lead', tier: 'L1', validFrom: day('2026-10-01'), createdBy: admin.id } });
    await tx.sdGroupMember.create({ data: { ...w, groupId: group.id, userId: farah.id, createdBy: admin.id } });
    await installPack(tx, a, d);
    return { d, group };
  };
  const adm = await desk('ADM', 'Admin help desk', 'admin');
  const fac = await desk('FAC', 'Facilities help desk', 'facilities');

  // ---- SD-2.13: the monthly fire-drill check ----
  const farahPerson = (await tx.personRole.findFirst({ where: { ...org, roleType: 'login', sourceTable: 'users', sourceId: farah.id }, select: { personId: true } }))?.personId;
  const requesterPersonId = farahPerson ?? (await tx.employee.findFirstOrThrow({ where: { ...org, workEmail: 'lakshmi.venkatesan@kaverifoods.test' } })).personId;
  const startsAt = new Date('2026-10-05T04:30:00Z');
  const rule = 'FREQ=MONTHLY;BYDAY=1MO';
  const safety = await tx.sdCategory.findFirst({ where: { ...org, deskId: fac.d.id, name: 'Safety checks' } });
  await tx.sdRecurring.create({
    data: {
      ...org,
      deskId: fac.d.id,
      name: 'Monthly fire-drill check',
      template: { subject: 'Monthly fire-drill check', bodyHtml: '<p>Check the alarms, extinguishers, exit signs and the assembly point on every floor. Note anything that needs fixing.</p>', categoryId: safety?.id ?? null, groupId: fac.group.id, priority: 2, requesterPersonId } as Prisma.InputJsonValue,
      rrule: rule,
      timeZone: 'Asia/Kolkata',
      startsAt,
      nextRunAt: nextRun({ rule, zone: 'Asia/Kolkata', startsAt }, new Date()),
      createdBy: admin.id,
    },
  });

  // ---- SD-2.08: the joiner journey and Nikhil Rao, joining in a week ----
  const laptop = await tx.sdCatalogItem.findFirst({ where: { ...org, deskId: it.id, name: 'New laptop' } });
  const idCard = await tx.sdCatalogItem.findFirstOrThrow({ where: { ...org, deskId: adm.d.id, name: 'ID card' } });
  const seat = await tx.sdCatalogItem.findFirstOrThrow({ where: { ...org, deskId: fac.d.id, name: 'Seat for a new joiner' } });
  const items = [laptop, idCard, seat].filter((x): x is NonNullable<typeof x> => Boolean(x));
  const journey = await tx.sdJourney.create({ data: { ...org, kind: 'join', name: 'New joiner at Kaveri Foods', itemIds: items.map((i) => i.id), createdBy: admin.id } });
  await tx.sdJourney.create({ data: { ...org, kind: 'exit', name: 'Leaver at Kaveri Foods', itemIds: [(await tx.sdCatalogItem.findFirstOrThrow({ where: { ...org, deskId: adm.d.id, name: 'Collect ID card and keys' } })).id, (await tx.sdCatalogItem.findFirstOrThrow({ where: { ...org, deskId: hr.id, name: 'Exit settlement' } })).id], createdBy: admin.id } });
  const joinOn = new Date(Date.now() + (330 + 7 * 1440) * 60_000).toISOString().slice(0, 10);
  const nikhil = await hireNikhil(tx, organizationId, hrUser.id, joinOn);
  const dueBy = new Date(`${joinOn}T03:30:00Z`);
  const ticketIds: string[] = [];
  for (const item of items) {
    const w = { ...org, deskId: item.deskId };
    const type = await tx.sdTicketType.findFirstOrThrow({ where: { ...w, kind: 'request' } });
    const status = await tx.sdStatus.findFirstOrThrow({ where: { ...w, systemState: 'new' }, orderBy: { sortOrder: 'asc' } });
    const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`UPDATE sd_counters SET next_number = next_number + 1 WHERE organization_id = ${organizationId}::uuid AND desk_id = ${item.deskId}::uuid RETURNING next_number - 1 AS n`;
    const deskRow = await tx.sdDesk.findFirstOrThrow({ where: { ...org, id: item.deskId } });
    const cat = item.categoryId ? await tx.sdCategory.findFirst({ where: { ...org, id: item.categoryId } }) : null;
    const t = await tx.sdTicket.create({ data: { ...w, seq: n, number: `${deskRow.numberPrefix}${n}`, typeId: type.id, statusId: status.id, priority: 3, categoryId: item.categoryId, subject: `New joiner at Kaveri Foods: Nikhil Rao`, requesterPersonId: nikhil.personId, groupId: cat?.defaultGroupId ?? null, channel: 'api', sensitive: Boolean(cat?.sensitive), tags: ['joiner'] } });
    const body = textToHtml(`Nikhil Rao joins on ${joinOn}. Prepared by YukthiX from the HR record (New joiner at Kaveri Foods).\n\n- ${item.name}`);
    await tx.sdTicketMessage.create({ data: { ...w, ticketId: t.id, kind: 'reply', side: 'requester', bodyHtml: body, bodyText: htmlToText(body), channel: 'api' } });
    await tx.sdTicketEvent.create({ data: { ...w, ticketId: t.id, kind: 'created', toValue: t.number, requesterVisible: true } });
    const ri = await tx.sdRequestItem.create({ data: { ...w, ticketId: t.id, itemId: item.id, itemVersion: item.currentVersion!, answers: {}, forPersonId: nikhil.personId, stage: 'fulfilment' } });
    const v = await tx.sdCatalogItemVersion.findFirstOrThrow({ where: { ...org, itemId: item.id, version: item.currentVersion! } });
    for (const [i, p] of (v.fulfilment as unknown as { title: string; groupId: string; note?: string }[]).entries()) {
      await tx.sdTask.create({ data: { ...w, ticketId: t.id, title: p.title, note: p.note ?? null, groupId: p.groupId, dueAt: dueBy, sortOrder: i, requestItemId: ri.id } });
    }
    ticketIds.push(t.id);
  }
  await tx.sdJourneyRun.create({ data: { ...org, journeyId: journey.id, employeeId: nikhil.employeeId, eventDate: day(joinOn), ticketIds, startedBy: hrUser.id } });

  // ---- SD-2.18 / SD-2.19: a live chat queue on the IT desk ----
  const team = await tx.sdGroup.findFirst({ where: { ...org, deskId: it.id, name: 'IT help desk team' } });
  await tx.sdChatQueue.create({
    data: {
      ...org,
      deskId: it.id,
      name: 'IT chat',
      groupId: team?.id ?? null,
      maxPerAgent: 3,
      waitMinutes: 10,
      welcome: 'Hi! Tell us what is wrong and someone from IT will join you here.',
      preChat: { sections: [{ id: 'pre', columns: 1, fields: [{ key: 'device', type: 'choice', label: 'What is it about?', required: true, options: [{ value: 'laptop', label: 'My laptop' }, { value: 'access', label: 'Access or password' }, { value: 'other', label: 'Something else' }] }] }], rules: [] },
      prompts: [{ id: 'help', pathPrefix: '/yx/desk/help', text: 'Stuck? Chat with IT now.', afterSeconds: 20 }],
      createdBy: admin.id,
    },
  });

  // ---- SD-2.06: Divya linked Microsoft Teams (cards reach her through the dev transport) ----
  await tx.channelLink.create({ data: { ...org, userId: panel.id, provider: 'teams', externalRef: 'divya.raghunathan@kaverifoods.onmicrosoft.test', label: 'Microsoft Teams' } });
}

/** Nikhil Rao, a new hire joining on `joinOn` (through the same change path as the API, YX-HIS-01). */
async function hireNikhil(tx: Tx, organizationId: string, hrUserId: string, joinOn: string) {
  const org = { organizationId };
  const ctx = { organizationId, isSuperAdmin: false, userId: hrUserId, role: null };
  const id = async (model: 'location' | 'department' | 'designation' | 'employmentType', code: string) => (await (tx[model] as unknown as { findFirstOrThrow(a: unknown): Promise<{ id: string }> }).findFirstOrThrow({ where: { ...org, code } })).id;
  const entity = (await tx.legalEntity.findFirstOrThrow({ where: { ...org, shortName: 'KFPL' } })).id;
  const divya = (await tx.employee.findFirstOrThrow({ where: { ...org, workEmail: 'divya.raghunathan@kaverifoods.test' } })).id;
  const personId = await personForEmployee(tx, ctx, { givenName: 'Nikhil', familyName: 'Rao', email: 'nikhil.rao@kaverifoods.test' });
  const employee = await tx.employee.create({ data: { ...org, personId, givenName: 'Nikhil', familyName: 'Rao', workEmail: 'nikhil.rao@kaverifoods.test', createdBy: hrUserId } });
  const employment = await tx.employment.create({ data: { ...org, employeeId: employee.id, legalEntityId: entity, employeeCode: 'KF-0201', codeScopeKey: entity, joinedOn: day(joinOn), createdBy: hrUserId } });
  await addRole(tx, ctx, personId, 'employee', { table: 'employments', id: employment.id }, employment.joinedOn);
  const change = await tx.employeeChange.create({
    data: {
      ...org,
      employeeId: employee.id,
      employmentId: employment.id,
      changeType: 'join',
      effectiveDate: day(joinOn),
      status: 'scheduled',
      payload: { assignment: { locationId: await id('location', 'BLR-HO'), departmentId: await id('department', 'QA'), designationId: await id('designation', 'QA-ANALYST'), gradeId: null, employmentTypeId: await id('employmentType', 'PERM'), managerEmployeeId: divya, costCentres: [] }, status: 'probation' } as Prisma.InputJsonObject,
      reason: 'Joins the QA team',
      requestedBy: hrUserId,
      decidedBy: hrUserId,
      decidedAt: new Date(),
    },
  });
  await new EmployeeHistoryService(undefined as never, undefined as never).rebuild(tx, ctx, employment, joinOn, change.id);
  if (joinOn <= todayIst()) await tx.employeeChange.update({ where: { id: change.id }, data: { status: 'effective', appliedAt: new Date() } });
  return { personId, employeeId: employee.id };
}
