import { Prisma } from '@prisma/client';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { STARTER_HOURS, starterFor, starterPriority } from '../src/service-desk/starter';
import { cleanHtml, htmlToText, textToHtml } from '../src/service-desk/rich-text';

// Service Desk demo for Kaveri Foods (M14 phase 3b-1, batch 1), fictional throughout:
//   - an IT desk (paid, ₹999 per agent) and the free HR desk inside YukthiX HR (D4);
//   - IT agent Suresh Pillai (it-agent@), IT team lead Farah Khan (it-lead@), collaborator Imran Sheikh (it-collab@,
//     free; sees only the tickets he is added to) and HR lead Lakshmi Venkatesan (hr@);
//   - a few tickets raised by Divya Raghunathan (panel@) and for Arjun Kulkarni, one sensitive payslip question.
// The System Admin (admin@) is the Service Desk admin: sets up desks, sees no tickets without a seat.
// Idempotent: skipped once the IT desk exists.

type Tx = Prisma.TransactionClient;

export const DESK_PERMISSIONS = [
  { key: 'desk.ticket.view', description: 'See the tickets of the desks you are on' },
  { key: 'desk.ticket.work', description: 'Own, be assigned and reply to tickets (a paid agent seat)' },
  { key: 'desk.ticket.note', description: 'Add internal notes to tickets' },
  { key: 'desk.ticket.assign', description: 'Assign tickets to other agents' },
  { key: 'desk.ticket.bulk', description: 'Change many tickets at once and share views' },
  { key: 'desk.ticket.merge', description: 'Merge tickets' },
  { key: 'desk.ticket.export', description: 'Export ticket lists as CSV' },
  { key: 'desk.ticket.purge_spam', description: 'Purge spam tickets' },
  { key: 'desk.task.work', description: 'Work on ticket tasks' },
  { key: 'desk.kb.view_internal', description: 'Read internal help articles' },
  { key: 'desk.kb.author', description: 'Write help articles' },
  { key: 'desk.kb.publish', description: 'Publish help articles' },
  { key: 'desk.sla.manage', description: 'Set business calendars and response targets' },
  { key: 'desk.settings.manage', description: 'Set up a desk: groups, categories, types, statuses, saved replies' },
  { key: 'desk.member.manage', description: 'Add and remove desk agents, leads, admins and collaborators' },
  { key: 'desk.desk.create', description: 'Create desks and run the Service Desk for the company' },
  { key: 'desk.portal.manage', description: 'Set up the help portal and banners' },
  { key: 'desk.mailbox.manage', description: 'Set up desk mailboxes and email rules' },
  { key: 'desk.customer.manage', description: 'Manage customer accounts and contacts' },
  { key: 'desk.report.view', description: 'See desk reports' },
  { key: 'desk.report.manage', description: 'Build and schedule desk reports' },
  { key: 'desk.audit.view', description: 'See who read which ticket' },
  { key: 'desk.pii.unmask', description: 'Show a masked value in a ticket (every view recorded)' },
  { key: 'desk.directory.manage', description: 'Set up directory sync for the Service Desk' },
  { key: 'desk.survey.manage', description: 'Set up NPS surveys and see their answers' },
  { key: 'desk.catalog.manage', description: 'Set up the service catalogue, order guides and the question library' },
  { key: 'desk.rule.manage', description: 'Set up automation rules for a desk' },
  { key: 'desk.integration.manage', description: 'Set up webhooks that desk rules call (needs a fresh security check)' },
  { key: 'desk.lifecycle.manage', description: 'Design ticket lifecycles: statuses, allowed moves and what each move needs' },
  { key: 'desk.channel.manage', description: 'Set up live chat queues, pre-chat forms and chat prompts' },
  { key: 'desk.chat.work', description: 'Take live chats from the desk queue' },
  { key: 'desk.hr_summary.view', description: 'See the employee summary beside a ticket (only the fields your HR access allows)' },
  { key: 'desk.ticket.move', description: 'Move a ticket to another desk or share it with one' },
];

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

export async function seedServiceDesk(tx: Tx, organizationId: string, actors: { admin: string; hr: string; panel: string; passwordHash: string }) {
  const org = { organizationId };
  // The restrictive visibility policy (§5.7) has no super-admin escape: seeding is desk system work.
  await tx.$executeRaw`SELECT set_config('app.sd_system', 'on', true)`;
  if (await tx.sdDesk.findFirst({ where: { ...org, key: 'IT' } })) return;

  // ---- people and their desk roles (P02 role templates, granted company-wide; reach comes from the seats) ----
  const user = (email: string, name: string) =>
    tx.user.upsert({ where: { organizationId_email: { organizationId, email } }, update: { name }, create: { ...org, email, name, passwordHash: actors.passwordHash, role: 'panel' } });
  const suresh = await user('it-agent@demo-org.test', 'Suresh Pillai');
  const farah = await user('it-lead@demo-org.test', 'Farah Khan');
  const imran = await user('it-collab@demo-org.test', 'Imran Sheikh');
  const role = async (key: string) => {
    const t = ROLE_TEMPLATES.find((x) => x.key === key)!;
    return (await tx.permissionProfile.findFirst({ where: { ...org, name: t.name } })) ?? (await tx.permissionProfile.create({ data: { ...org, name: t.name, permissionsJson: JSON.stringify(t.permissions) } }));
  };
  const grant = async (userId: string, key: string) =>
    tx.roleGrant.create({ data: { ...org, userId, permissionProfileId: (await role(key)).id, scopeType: 'tenant', validFrom: day('2026-10-01'), status: 'active', reason: 'Service Desk demo', grantedBy: actors.admin } });
  await grant(suresh.id, 'desk_agent');
  await grant(farah.id, 'desk_lead');
  await grant(imran.id, 'desk_collaborator');
  await grant(actors.hr, 'desk_lead');

  // ---- the shared Office hours calendar ----
  const cal = await tx.businessCalendar.create({ data: { ...org, name: 'Office hours', timeZone: 'Asia/Kolkata', createdBy: actors.admin } });
  await tx.businessCalendarHours.createMany({ data: STARTER_HOURS.map((h) => ({ ...org, calendarId: cal.id, ...h, validFrom: day('2026-01-01'), createdBy: actors.admin })) });
  await tx.businessCalendarHoliday.createMany({
    data: [
      { ...org, calendarId: cal.id, holidayOn: day('2026-10-20'), name: 'Dussehra', createdBy: actors.admin },
      { ...org, calendarId: cal.id, holidayOn: day('2026-11-09'), name: 'Diwali', createdBy: actors.admin },
      { ...org, calendarId: cal.id, holidayOn: day('2026-11-10'), name: 'Diwali (second day)', halfDay: true, createdBy: actors.admin },
    ],
  });

  // ---- desks with the starter set-up (the same data DesksService.create copies in) ----
  const desk = async (key: string, name: string, kind: string, billingClass: string) => {
    const d = await tx.sdDesk.create({ data: { ...org, key, name, kind, billingClass, calendarId: cal.id, numberPrefix: `${key}-`, createdBy: actors.admin } });
    const w = { ...org, deskId: d.id };
    await tx.sdCounter.create({ data: { ...w, nextNumber: 1001 } });
    const s = starterFor(kind);
    await tx.sdTicketType.createMany({ data: s.types.map((t, i) => ({ ...w, kind: t.kind, name: t.name, sortOrder: i })) });
    await tx.sdStatus.createMany({ data: s.statuses.map((x, i) => ({ ...w, label: x.label, systemState: x.systemState, sortOrder: i })) });
    const group = await tx.sdGroup.create({ data: { ...w, name: `${name} team`, assignmentMethod: 'round_robin' } });
    await tx.sdCategory.createMany({ data: s.categories.map((c, i) => ({ ...w, name: c.name, sensitive: Boolean(c.sensitive), defaultGroupId: group.id, sortOrder: i })) });
    await tx.sdPriorityMatrix.createMany({ data: [1, 2, 3, 4].flatMap((impact) => [1, 2, 3, 4].map((urgency) => ({ ...w, impact, urgency, priority: starterPriority(impact, urgency) }))) });
    return { d, group };
  };
  const it = await desk('IT', 'IT help desk', 'it', 'service_desk');
  // D4: the first HR desk of a company with YukthiX HR is inside the HRMS price.
  const hr = await desk('HR', 'HR help desk', 'hr', 'hrms_included');

  const seat = (deskId: string, userId: string, r: string, tier: string | null) => tx.sdDeskMember.create({ data: { ...org, deskId, userId, role: r, tier, validFrom: day('2026-10-01'), createdBy: actors.admin } });
  await seat(it.d.id, suresh.id, 'agent', 'L1');
  await seat(it.d.id, farah.id, 'lead', 'L2');
  await seat(it.d.id, imran.id, 'collaborator', null);
  await seat(hr.d.id, actors.hr, 'lead', 'L1');
  await tx.sdGroupMember.createMany({ data: [suresh.id, farah.id].map((userId) => ({ ...org, deskId: it.d.id, groupId: it.group.id, userId, createdBy: actors.admin })) });
  await tx.sdGroupMember.create({ data: { ...org, deskId: hr.d.id, groupId: hr.group.id, userId: actors.hr, createdBy: actors.admin } });

  await tx.sdCannedResponse.createMany({
    data: [
      { ...org, deskId: it.d.id, title: 'Password reset steps', bodyHtml: cleanHtml('<p>Hi {{requester.first_name}},</p><p>Open <strong>My security</strong>, choose <em>Change password</em> and follow the steps. Reply here if it still does not work.</p><p>{{agent.name}}, IT help desk</p>'), createdBy: actors.admin },
      { ...org, deskId: it.d.id, title: 'Laptop handed to repair', bodyHtml: cleanHtml('<p>Hi {{requester.first_name}},</p><p>Your laptop is with our repair partner. We will update {{ticket.number}} when it is back.</p>'), createdBy: actors.admin },
      { ...org, deskId: hr.d.id, title: 'Leave balance', bodyHtml: cleanHtml('<p>Hi {{requester.first_name}},</p><p>You can see your leave balance under <strong>Me › Leave</strong>.</p>'), createdBy: actors.admin },
    ],
  });
  const itStatus = async (label: string) => (await tx.sdStatus.findFirstOrThrow({ where: { ...org, deskId: it.d.id, label } })).id;
  await tx.sdScenario.create({ data: { ...org, deskId: it.d.id, name: 'Ask for the laptop tag', actions: { statusId: await itStatus('Waiting on requester'), reply: cleanHtml('<p>Please send the asset tag on the bottom of your laptop.</p>') }, createdBy: actors.admin } });

  // ---- tickets ----
  const personOf = async (email: string) => (await tx.employee.findFirstOrThrow({ where: { ...org, workEmail: email }, select: { personId: true } })).personId;
  const divya = await personOf('divya.raghunathan@kaverifoods.test');
  const arjun = await personOf('arjun.kulkarni@kaverifoods.test');
  const meera = await personOf('meera.iyer@kaverifoods.test');
  await tx.sdRequesterFlag.create({ data: { ...org, personId: meera, vip: true, note: 'Head of Quality' } });

  const raise = async (
    d: { d: { id: string; key: string } },
    o: { subject: string; text: string; category: string; requester: string; requestedFor?: string; assignee?: string; status?: string; type?: string; hoursAgo: number; tags?: string[]; priority?: number },
  ) => {
    const w = { ...org, deskId: d.d.id };
    const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`UPDATE sd_counters SET next_number = next_number + 1 WHERE organization_id = ${organizationId}::uuid AND desk_id = ${d.d.id}::uuid RETURNING next_number - 1 AS n`;
    const cat = await tx.sdCategory.findFirstOrThrow({ where: { ...w, name: o.category } });
    const type = await tx.sdTicketType.findFirstOrThrow({ where: { ...w, ...(o.type ? { name: o.type } : {}) }, orderBy: { sortOrder: 'asc' } });
    const status = await tx.sdStatus.findFirstOrThrow({ where: { ...w, label: o.status ?? 'New' } });
    const at = hoursAgo(o.hoursAgo);
    const t = await tx.sdTicket.create({
      data: {
        ...w,
        seq: n,
        number: `${d.d.key}-${n}`,
        typeId: type.id,
        statusId: status.id,
        priority: o.priority ?? 3,
        categoryId: cat.id,
        subject: o.subject,
        requesterPersonId: o.requester,
        requestedForPersonId: o.requestedFor ?? null,
        openedByUserId: actors.panel,
        assigneeUserId: o.assignee ?? null,
        groupId: cat.defaultGroupId,
        channel: 'portal',
        sensitive: cat.sensitive,
        vip: o.requester === meera,
        tags: o.tags ?? [],
        createdAt: at,
        updatedAt: at,
      },
    });
    const body = textToHtml(o.text);
    await tx.sdTicketMessage.create({ data: { ...w, ticketId: t.id, kind: 'reply', side: 'requester', authorPersonId: o.requester, bodyHtml: body, bodyText: htmlToText(body), channel: 'portal', createdAt: at } });
    await tx.sdTicketEvent.create({ data: { ...w, ticketId: t.id, kind: 'created', toValue: t.number, requesterVisible: true, at } });
    if (o.assignee) await tx.sdTicketEvent.create({ data: { ...w, ticketId: t.id, kind: 'assigned', toValue: o.assignee, reason: 'Assigned automatically', at } });
    if (o.requestedFor) await tx.sdTicketWatcher.create({ data: { ...w, ticketId: t.id, personId: o.requestedFor } });
    return t;
  };

  const vpn = await raise(it, { subject: 'VPN keeps disconnecting from home', text: 'Since Monday the VPN drops every 10 minutes when I work from home. Office Wi-Fi is fine.', category: 'Network and Wi-Fi', requester: divya, assignee: suresh.id, status: 'In progress', hoursAgo: 26, tags: ['vpn'], priority: 2 });
  await tx.sdTicketMessage.create({ data: { ...org, deskId: it.d.id, ticketId: vpn.id, kind: 'note', side: 'agent', authorUserId: suresh.id, bodyHtml: '<p>Same router model as the two tickets last week. Checking the client version first.</p>', bodyText: 'Same router model as the two tickets last week. Checking the client version first.', channel: 'agent', createdAt: hoursAgo(24) } });
  await tx.sdTicketMessage.create({ data: { ...org, deskId: it.d.id, ticketId: vpn.id, kind: 'reply', side: 'agent', authorUserId: suresh.id, bodyHtml: '<p>Hi Divya, please update the VPN app to version 7.2 from the Software Centre and tell us if it still drops.</p>', bodyText: 'Hi Divya, please update the VPN app to version 7.2 from the Software Centre and tell us if it still drops.', channel: 'agent', createdAt: hoursAgo(23) } });
  await tx.sdTicket.update({ where: { id: vpn.id }, data: { firstResponseAt: hoursAgo(23) } });
  await tx.sdTimeEntry.create({ data: { ...org, deskId: it.d.id, ticketId: vpn.id, userId: suresh.id, minutes: 20, note: 'Checked logs', workedOn: day(new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)) } });
  await tx.sdTicketCollaborator.create({ data: { ...org, deskId: it.d.id, ticketId: vpn.id, userId: imran.id, addedBy: suresh.id } });

  await raise(it, { subject: 'New laptop for Arjun', text: 'Arjun joins the analytics team on Monday and needs a laptop with Power BI.', category: 'Laptop and devices', requester: divya, requestedFor: arjun, type: 'Request', hoursAgo: 5 });
  await raise(it, { subject: 'Cannot open the shared drive', text: 'The Finance shared drive says access denied since this morning.', category: 'Access and accounts', requester: arjun, assignee: farah.id, status: 'Waiting on requester', hoursAgo: 50 });
  await raise(it, { subject: 'Printer on 2nd floor jams', text: 'The printer near the canteen jams on every second page.', category: 'Other', requester: meera, hoursAgo: 2 });

  await raise(hr, { subject: 'LOP on my September payslip', text: 'My September payslip shows one day of loss of pay, but I was on approved leave that day.', category: 'Payslip and pay', requester: divya, assignee: actors.hr, hoursAgo: 30, priority: 2 });
  await raise(hr, { subject: 'Experience letter needed', text: 'Please share my experience letter for a visa application.', category: 'Letters and documents', requester: arjun, hoursAgo: 4 });
}
