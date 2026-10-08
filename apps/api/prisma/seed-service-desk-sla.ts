import { Prisma } from '@prisma/client';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { CalendarSpec, addBusinessSeconds } from '../src/service-desk/business-time';
import { textToHtml, htmlToText } from '../src/service-desk/rich-text';

// Service Desk demo, batch 2 (M14 SD-1.09 … SD-1.17), Kaveri Foods, fictional throughout:
//   - the IT desk gets an SLA policy "IT standard" (first response and resolution by priority, office hours) and an
//     OLA "IT team hand-offs", resolution codes, a "New joiner laptop" template with a checklist, and a 95 % target
//     for P2 resolutions this month;
//   - one demo ticket is near its breach: "Payroll export keeps timing out" (P2) has used 90 % of its resolution
//     time, so it shows amber on the list and its timeline; the next sweep breaches it if nobody acts.
// Idempotent: skipped once the IT desk has an SLA policy. Runs on an existing batch-1 seed too.

type Tx = Prisma.TransactionClient;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function seedServiceDeskSla(tx: Tx, organizationId: string) {
  const org = { organizationId };
  // The desk's restrictive visibility policy (§5.7) has no super-admin escape; seeding is desk system work.
  await tx.$executeRaw`SELECT set_config('app.sd_system', 'on', true)`;
  const it = await tx.sdDesk.findFirst({ where: { ...org, key: 'IT' } });
  if (!it || (await tx.sdSlaPolicy.findFirst({ where: { ...org, deskId: it.id } }))) return;

  // The desk role templates gained keys in batch 2 (leads: who read a ticket, show masked values).
  for (const key of ['desk_lead', 'desk_agent', 'desk_collaborator', 'desk_admin', 'service_desk_admin']) {
    const t = ROLE_TEMPLATES.find((x) => x.key === key)!;
    await tx.permissionProfile.updateMany({ where: { ...org, name: t.name }, data: { permissionsJson: JSON.stringify(t.permissions) } });
  }

  const admin = (await tx.user.findFirstOrThrow({ where: { ...org, email: 'admin@demo-org.test' }, select: { id: true } })).id;
  const w = { ...org, deskId: it.id };
  const validFrom = new Date('2026-01-01T00:00:00Z');
  const sla = await tx.sdSlaPolicy.create({ data: { ...w, name: 'IT standard', kind: 'sla', createdBy: admin } });
  const version = await tx.sdSlaPolicyVersion.create({
    data: {
      ...w,
      policyId: sla.id,
      version: 1,
      validFrom,
      scope: { match: 'all', rules: [] },
      calendarSource: 'desk',
      targets: [
        { metric: 'first_response', minutes: [30, 60, 240, 480] },
        { metric: 'next_response', minutes: [60, 120, 480, 960] },
        { metric: 'resolution', minutes: [240, 480, 1440, 2880], milestones: [{ percent: 75, actions: [{ type: 'notify_assignee' }] }, { percent: 100, actions: [{ type: 'notify_assignee' }, { type: 'notify_group_leads' }] }, { percent: 150, actions: [{ type: 'notify_desk_leads' }, { type: 'raise_priority' }] }] },
      ],
      pauseStates: ['pending', 'on_hold'],
      createdBy: admin,
    },
  });
  const ola = await tx.sdSlaPolicy.create({ data: { ...w, name: 'IT team hand-offs', kind: 'ola', createdBy: admin } });
  await tx.sdSlaPolicyVersion.create({ data: { ...w, policyId: ola.id, version: 1, validFrom, scope: { match: 'all', rules: [] }, calendarSource: 'desk', targets: [{ metric: 'group', minutes: [120, 240, 960, 1920] }, { metric: 'task', minutes: [240, 480, 1440, 2880] }], createdBy: admin } });
  await tx.sdSlaComplianceTarget.createMany({ data: [{ ...w, metric: 'resolution', priority: 2, targetPercent: 95, createdBy: admin }, { ...w, metric: 'first_response', priority: null, targetPercent: 90, createdBy: admin }] });

  await tx.sdResolutionCode.createMany({
    data: [
      { ...w, code: 'fixed', label: 'Fixed', sortOrder: 0 },
      { ...w, code: 'workaround', label: 'Workaround given', sortOrder: 1 },
      { ...w, code: 'how_to', label: 'Explained how to', sortOrder: 2 },
      { ...w, code: 'duplicate', label: 'Duplicate', sortOrder: 3 },
      { ...w, code: 'no_reply', label: 'No reply from requester', sortOrder: 4 },
    ],
  });
  const laptops = await tx.sdCategory.findFirst({ where: { ...w, name: 'Laptop and devices' } });
  await tx.sdTemplate.create({ data: { ...w, name: 'New joiner laptop', defaults: { categoryId: laptops?.id, tags: ['joiner'] }, checklist: ['Pick a laptop from stock', 'Install the standard software', 'Create the email account', 'Hand over and get a signature'], createdBy: admin } });

  // ---- a ticket close to missing its resolution target ----
  const cal = await tx.businessCalendar.findFirstOrThrow({ where: { ...org, id: it.calendarId! } });
  const hours = await tx.businessCalendarHours.findMany({ where: { ...org, calendarId: cal.id } });
  const holidays = await tx.businessCalendarHoliday.findMany({ where: { ...org, calendarId: cal.id } });
  const spec: CalendarSpec = {
    zone: cal.timeZone,
    halfDayOpen: cal.halfDayOpenHalf === 'second' ? 'second' : 'first',
    hours: hours.map((h) => ({ weekday: h.weekday, startMinute: h.startMinute, endMinute: h.endMinute, validFrom: iso(h.validFrom), validTo: h.validTo ? iso(h.validTo) : null })),
    holidays: holidays.map((h) => ({ on: iso(h.holidayOn), halfDay: h.halfDay })),
  };
  const farah = await tx.user.findFirstOrThrow({ where: { ...org, email: 'it-lead@demo-org.test' }, select: { id: true } });
  const suresh = await tx.user.findFirstOrThrow({ where: { ...org, email: 'it-agent@demo-org.test' }, select: { id: true } });
  const meera = (await tx.employee.findFirstOrThrow({ where: { ...org, workEmail: 'meera.iyer@kaverifoods.test' }, select: { personId: true } })).personId;
  const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`UPDATE sd_counters SET next_number = next_number + 1 WHERE organization_id = ${organizationId}::uuid AND desk_id = ${it.id}::uuid RETURNING next_number - 1 AS n`;
  const cat = await tx.sdCategory.findFirstOrThrow({ where: { ...w, name: 'Software' } });
  const type = await tx.sdTicketType.findFirstOrThrow({ where: { ...w, kind: 'incident' } });
  const status = await tx.sdStatus.findFirstOrThrow({ where: { ...w, label: 'In progress' } });
  const now = new Date();
  const raisedAt = new Date(now.getTime() - 2 * 86_400_000);
  const t = await tx.sdTicket.create({
    data: { ...w, seq: n, number: `IT-${n}`, typeId: type.id, statusId: status.id, priority: 2, categoryId: cat.id, subject: 'Payroll export keeps timing out', requesterPersonId: meera, openedByUserId: suresh.id, assigneeUserId: suresh.id, groupId: cat.defaultGroupId, channel: 'portal', vip: true, tags: ['payroll-export'], firstResponseAt: new Date(raisedAt.getTime() + 20 * 60_000), createdAt: raisedAt, updatedAt: now },
  });
  const body = textToHtml('The monthly payroll export stops after 5 minutes with a time-out. Finance needs it by tomorrow.');
  await tx.sdTicketMessage.create({ data: { ...w, ticketId: t.id, kind: 'reply', side: 'requester', authorPersonId: meera, bodyHtml: body, bodyText: htmlToText(body), channel: 'portal', createdAt: raisedAt } });
  const reply = textToHtml('Hi Meera, we are looking at the export server now.');
  await tx.sdTicketMessage.create({ data: { ...w, ticketId: t.id, kind: 'reply', side: 'agent', authorUserId: suresh.id, bodyHtml: reply, bodyText: htmlToText(reply), channel: 'agent', createdAt: new Date(raisedAt.getTime() + 20 * 60_000) } });
  await tx.sdTicketEvent.create({ data: { ...w, ticketId: t.id, kind: 'created', toValue: t.number, requesterVisible: true, at: raisedAt } });
  await tx.sdTask.create({ data: { ...w, ticketId: t.id, title: 'Check the export server logs', assigneeUserId: farah.id, createdBy: suresh.id } });

  const target = 480 * 60;
  const used = Math.round(target * 0.9);
  const dueAt = addBusinessSeconds(spec, now, target - used);
  const fr = await tx.sdSlaTimer.create({ data: { ...w, ticketId: t.id, policyVersionId: version.id, kind: 'sla', metric: 'first_response', calendarId: cal.id, state: 'met', startedAt: raisedAt, usedSeconds: 20 * 60, targetSeconds: 60 * 60, metAt: new Date(raisedAt.getTime() + 20 * 60_000) } });
  await tx.sdSlaTimerEvent.createMany({ data: [{ ...w, ticketId: t.id, timerId: fr.id, kind: 'start', at: raisedAt }, { ...w, ticketId: t.id, timerId: fr.id, kind: 'met', at: new Date(raisedAt.getTime() + 20 * 60_000), reason: 'Done' }] });
  const res = await tx.sdSlaTimer.create({ data: { ...w, ticketId: t.id, policyVersionId: version.id, kind: 'sla', metric: 'resolution', calendarId: cal.id, state: 'running', startedAt: raisedAt, resumedAt: now, usedSeconds: used, targetSeconds: target, dueAt, nextMilestonePercent: 100, nextMilestoneAt: dueAt, jobVersion: 1 } });
  await tx.sdSlaTimerEvent.createMany({ data: [{ ...w, ticketId: t.id, timerId: res.id, kind: 'start', at: raisedAt }, { ...w, ticketId: t.id, timerId: res.id, kind: 'milestone', percent: 75, jobVersion: 0, reason: 'Resolution at 75 %', at: new Date(now.getTime() - 3_600_000) }] });
  await tx.sdTicketEvent.create({ data: { ...w, ticketId: t.id, kind: 'sla_milestone', toValue: '75 %', reason: 'Resolution', at: new Date(now.getTime() - 3_600_000) } });
}
