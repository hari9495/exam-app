import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { OrgSecretsCryptoService } from '@exam-platform/shared';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { htmlToText, textToHtml } from '../src/service-desk/rich-text';
import { starterFor, starterPriority } from '../src/service-desk/starter';
import { DEV_MAILBOXES } from './seed-service-desk-channels';

// Service Desk batch 4 demo (M14 SD-1.24 … SD-1.31), fictional throughout.
//
// Kaveri Foods (demo-org):
//   - knowledge: a public help centre /yx/help/demo-org/help for Customer Care customers ("How to track your order",
//     "A packet arrived torn"), IT articles for employees (Wi-Fi, VPN, with a Hindi translation) and an internal note
//     for IT agents; a draft waiting for review; article templates and a shared "Customer Care hours" block;
//   - a solved IT ticket rated 5 of 5 by Divya, an NPS survey on Customer Care, KPI targets and two weeks of history for
//     the IT desk, and a wall screen for the IT team (laptop link: see DEV_WALLBOARD).
// YukthiX itself (the platform tenant, slug yukthix): the "YukthiX Support" desk (YXS) with its hours (Mon–Sat
// 9:00–19:00 IST) and a round-the-clock calendar for Severity 1, SLA policies for Standard and Priority Support, the
// support@yukthix.test mailbox, customer accounts "Kaveri Foods" (Standard) and "Ganga Textiles" (Priority Support)
// linked to those companies, one open ticket from Kaveri Foods, and the staff member Anand Iyer (super@platform.test)
// linked as a YukthiX Support agent for the console.
// Idempotent: each part is skipped once it exists.

type Tx = Prisma.TransactionClient;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);
const isoDaysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);

/** LAPTOP ONLY: the IT wall screen opens at /yx/wall/<demo org id>/<token>. */
export const DEV_WALLBOARD = 'devItWallboardToken-0123456789abcdefABCDEFghij';
export const DEV_SUPPORT_MAILBOX = { address: 'support@yukthix.test', token: 'devYukthixSupportToken-0123456789abcdefABCD', secret: 'dev-yukthix-support-signing-secret' };

export async function seedServiceDeskKnowledge(tx: Tx, organizationId: string) {
  const org = { organizationId };
  await tx.$executeRaw`SELECT set_config('app.sd_system', 'on', true)`;
  // The desk role templates gained batch-4 keys (articles, reports, surveys, directory).
  for (const key of ['desk_lead', 'desk_agent', 'desk_collaborator', 'desk_admin', 'service_desk_admin']) {
    const t = ROLE_TEMPLATES.find((x) => x.key === key)!;
    await tx.permissionProfile.updateMany({ where: { ...org, name: t.name }, data: { permissionsJson: JSON.stringify(t.permissions) } });
  }
  const it = await tx.sdDesk.findFirst({ where: { ...org, key: 'IT' } });
  const care = await tx.sdDesk.findFirst({ where: { ...org, key: 'CARE' } });
  if (!it || !care || (await tx.sdKbSpace.findFirst({ where: org }))) return;
  const user = async (email: string) => (await tx.user.findFirstOrThrow({ where: { ...org, email }, select: { id: true } })).id;
  const admin = await user('admin@demo-org.test');
  const farah = await user('it-lead@demo-org.test');
  const suresh = await user('it-agent@demo-org.test');

  // ---- knowledge (SD-1.24, SD-1.25) ----
  const block = await tx.sdKbBlock.create({ data: { ...org, key: 'care-hours', name: 'Customer Care hours', bodyHtml: '<p><strong>Customer Care</strong> answers Monday to Saturday, 9:00 to 19:00 India time, at care@kaverifoods.test.</p>', createdBy: farah } });
  await tx.sdKbTemplate.createMany({
    data: [
      { ...org, name: 'How-to', bodyHtml: '<h3>What you need</h3><p></p><h3>Steps</h3><ol><li></li></ol><h3>If it does not work</h3><p></p>', createdBy: farah },
      { ...org, name: 'Troubleshooting', bodyHtml: '<h3>What you see</h3><p></p><h3>Why it happens</h3><p></p><h3>How to fix it</h3><ol><li></li></ol>', createdBy: farah },
      { ...org, name: 'FAQ', bodyHtml: '<h3>Question</h3><p></p><h3>Answer</h3><p></p>', createdBy: farah },
    ],
  });
  const space = (deskId: string, slug: string, name: string, audience: string, languages = ['en']) => tx.sdKbSpace.create({ data: { ...org, deskId, slug, name, audience, languages, createdBy: admin } });
  const help = await space(care.id, 'help', 'Kaveri Foods Help', 'public');
  const itHelp = await space(it.id, 'it-help', 'IT help', 'requesters', ['en', 'hi']);
  const itNotes = await space(it.id, 'it-notes', 'IT team notes', 'agents');
  const cat = (spaceId: string, name: string, parentId: string | null = null, sortOrder = 0) => tx.sdKbCategory.create({ data: { ...org, spaceId, name, parentId, sortOrder, createdBy: farah } });
  const orders = await cat(help.id, 'Orders and delivery');
  const quality = await cat(help.id, 'Product quality', null, 1);
  const network = await cat(itHelp.id, 'Network and Wi-Fi');
  const access = await cat(itHelp.id, 'Passwords and access', null, 1);
  let number = 100;
  const article = async (o: { spaceId: string; categoryId: string | null; slug: string; title: string; summary: string; body: string; state?: 'published' | 'draft'; featured?: boolean; language?: string; translationOfId?: string; submitted?: boolean; seoDescription?: string }) => {
    number++;
    const published = (o.state ?? 'published') === 'published';
    const a = await tx.sdKbArticle.create({
      data: {
        ...org,
        spaceId: o.spaceId,
        categoryId: o.categoryId,
        number,
        slug: o.slug,
        language: o.language ?? 'en',
        translationOfId: o.translationOfId ?? null,
        audience: 'public',
        state: published ? 'published' : o.submitted ? 'in_review' : 'draft',
        ownerUserId: farah,
        title: o.title,
        summary: o.summary,
        bodyHtml: published ? o.body : '',
        bodyText: published ? htmlToText(o.body.replace(/\{\{block:care-hours\}\}/g, block.bodyHtml)) : '',
        seoDescription: o.seoDescription ?? null,
        publishedVersion: published ? 1 : null,
        publishedAt: published ? hoursAgo(72) : null,
        featured: Boolean(o.featured),
        reviewDueOn: day(isoDaysAgo(-330)),
        createdBy: farah,
      },
    });
    await tx.sdKbArticleVersion.create({ data: { ...org, articleId: a.id, version: 1, title: o.title, summary: o.summary, bodyHtml: o.body, authorUserId: farah, submittedAt: published || o.submitted ? hoursAgo(80) : null, reviewedBy: published ? admin : null, reviewedAt: published ? hoursAgo(73) : null, publishedAt: published ? hoursAgo(72) : null } });
    return a;
  };
  const track = await article({
    spaceId: help.id,
    categoryId: orders.id,
    slug: 'track-your-order',
    title: 'How to track your order',
    summary: 'See where your Kaveri Foods order is, from packing to delivery.',
    seoDescription: 'Track a Kaveri Foods order step by step: find the order number, open the tracking page and read each status.',
    featured: true,
    body: '<p>Every order has a number like <strong>4471</strong> on your invoice.</p><ol><li>Open the tracking page from the order email.</li><li>Type the order number.</li><li>Read the status: Packed, Shipped, Out for delivery, Delivered.</li></ol><p>If the status has not changed for two days, write to us.</p>{{block:care-hours}}',
  });
  await tx.sdKbSlugHistory.create({ data: { ...org, spaceId: help.id, language: 'en', slug: 'order-tracking', articleId: track.id } });
  await article({ spaceId: help.id, categoryId: quality.id, slug: 'packet-arrived-torn', title: 'A packet arrived torn or damaged', summary: 'What to do when a packet is torn, wet or crushed.', body: '<p>We are sorry. Take a photo of the packet and its batch number, then raise a ticket with the photo. We send a new packet or refund it within 3 working days.</p>{{block:care-hours}}' });
  const wifi = await article({ spaceId: itHelp.id, categoryId: network.id, slug: 'connect-to-office-wi-fi', title: 'Connect to the office Wi-Fi', summary: 'Join KaveriStaff on a laptop or phone.', featured: true, body: '<ol><li>Choose the network <strong>KaveriStaff</strong>.</li><li>Sign in with your work email and YukthiX password.</li><li>Accept the certificate named kaverifoods.test.</li></ol><p>Guests use <strong>KaveriGuest</strong> with the code at the reception.</p>' });
  await article({ spaceId: itHelp.id, categoryId: network.id, slug: 'office-wi-fi-se-judein', title: 'ऑफिस वाई-फाई से जुड़ें', summary: 'लैपटॉप या फ़ोन पर KaveriStaff से जुड़ें।', language: 'hi', translationOfId: wifi.id, body: '<ol><li><strong>KaveriStaff</strong> नेटवर्क चुनें।</li><li>अपने काम के ईमेल और YukthiX पासवर्ड से साइन इन करें।</li></ol>' });
  await article({ spaceId: itHelp.id, categoryId: access.id, slug: 'reset-your-vpn-password', title: 'Reset your VPN password', summary: 'The VPN uses your YukthiX password; change it there.', body: '<p>The VPN signs you in with your YukthiX password. Change it under <strong>Me › Security</strong>; the VPN takes the new password within 5 minutes.</p>' });
  await article({ spaceId: itNotes.id, categoryId: null, slug: 'printer-jam-second-floor', title: 'Printer jam on the 2nd floor: fix steps', summary: 'Internal: the HP printer near the canteen.', body: '<p>Open tray 2, pull the green lever, remove the paper slowly. If the error stays, power-cycle and call the vendor (contract KF-PR-22).</p>' });
  await article({ spaceId: itHelp.id, categoryId: access.id, slug: 'set-up-two-step-verification', title: 'Set up two-step verification', summary: 'Add a passkey or an authenticator app.', state: 'draft', submitted: true, body: '<p>Go to <strong>Me › Security</strong> and choose <strong>Passkey</strong>. Follow the steps your browser shows.</p>' });
  // A few anonymous self-service counts so the funnel and content-gap reports have something to show.
  await tx.sdKbEvent.createMany({
    data: [
      ...['track order', 'track order', 'refund', 'torn packet', 'gift card', 'gift card', 'bulk discount'].map((q, i) => ({ ...org, spaceId: help.id, kind: 'search', query: q, results: ['gift card', 'bulk discount'].includes(q) ? 0 : 1, source: 'public', createdAt: hoursAgo(10 + i) })),
      ...[1, 2, 3].map((i) => ({ ...org, spaceId: help.id, kind: 'view', articleId: track.id, source: 'public', createdAt: hoursAgo(9 + i) })),
      { ...org, spaceId: help.id, kind: 'solved', articleId: track.id, source: 'public', createdAt: hoursAgo(9) },
      { ...org, spaceId: itHelp.id, kind: 'search', query: 'printer', results: 0, source: 'help', createdAt: hoursAgo(5) },
    ],
  });

  // ---- a solved IT ticket rated 5 of 5 (SD-1.26) ----
  const divya = (await tx.employee.findFirstOrThrow({ where: { ...org, workEmail: 'divya.raghunathan@kaverifoods.test' }, select: { personId: true } })).personId!;
  const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`UPDATE sd_counters SET next_number = next_number + 1 WHERE organization_id = ${organizationId}::uuid AND desk_id = ${it.id}::uuid RETURNING next_number - 1 AS n`;
  const dw = { ...org, deskId: it.id };
  const laptops = await tx.sdCategory.findFirstOrThrow({ where: { ...dw, name: 'Laptop and devices' } });
  const type = await tx.sdTicketType.findFirstOrThrow({ where: dw, orderBy: { sortOrder: 'asc' } });
  const solved = await tx.sdStatus.findFirstOrThrow({ where: { ...dw, systemState: 'solved' }, orderBy: { sortOrder: 'asc' } });
  const t = await tx.sdTicket.create({
    data: { ...dw, seq: n, number: `IT-${n}`, typeId: type.id, statusId: solved.id, priority: 3, categoryId: laptops.id, subject: 'Laptop charger stopped working', requesterPersonId: divya, assigneeUserId: suresh, groupId: laptops.defaultGroupId, channel: 'portal', createdAt: hoursAgo(30), updatedAt: hoursAgo(20), firstResponseAt: hoursAgo(29), resolvedAt: hoursAgo(20), ratingAskedAt: hoursAgo(20), resolutionNote: 'Replaced the charger from stock.' },
  });
  const q = textToHtml('My laptop charger stopped working this morning. The light does not come on.');
  const ans = textToHtml('Hello Divya, a new charger is waiting for you at the IT desk on the 1st floor.');
  await tx.sdTicketMessage.createMany({
    data: [
      { ...dw, ticketId: t.id, kind: 'reply', side: 'requester', authorPersonId: divya, bodyHtml: q, bodyText: htmlToText(q), channel: 'portal', createdAt: hoursAgo(30) },
      { ...dw, ticketId: t.id, kind: 'reply', side: 'agent', authorUserId: suresh, bodyHtml: ans, bodyText: htmlToText(ans), channel: 'agent', createdAt: hoursAgo(29) },
    ],
  });
  await tx.sdTicketEvent.createMany({ data: [{ ...dw, ticketId: t.id, kind: 'created', toValue: t.number, requesterVisible: true, at: hoursAgo(30) }, { ...dw, ticketId: t.id, kind: 'rated', toValue: '5', requesterVisible: true, byPersonId: divya, at: hoursAgo(19) }] });
  await tx.sdRating.create({ data: { ...org, deskId: it.id, ticketId: t.id, personId: divya, agentUserId: suresh, groupId: laptops.defaultGroupId, score: 5, comment: 'Quick and friendly, thank you!', channel: 'app', createdAt: hoursAgo(19) } });

  // ---- NPS on Customer Care, KPI targets and two weeks of history, a wall screen (SD-1.26, SD-1.27) ----
  await tx.sdSurvey.create({ data: { ...org, deskId: care.id, name: 'Customer Care NPS', question: 'How likely are you to recommend Kaveri Foods to a friend or another shop?', everyDays: 90, periodDays: 90, nextRunAt: day(isoDaysAgo(-30)), createdBy: farah } });
  await tx.sdKpiTarget.createMany({
    data: [
      { ...dw, metric: 'sla_met_pct', target: 90, amber: 80, higherIsBetter: true, updatedBy: farah },
      { ...dw, metric: 'first_response_h', target: 2, amber: 4, higherIsBetter: false, updatedBy: farah },
      { ...dw, metric: 'csat_pct', target: 85, amber: 70, higherIsBetter: true, updatedBy: farah },
      { ...dw, metric: 'backlog', target: 10, amber: 20, higherIsBetter: false, updatedBy: farah },
    ],
  });
  const rag = (v: number, t: number, a: number, up: boolean) => (up ? (v >= t ? 'green' : v >= a ? 'amber' : 'red') : v <= t ? 'green' : v <= a ? 'amber' : 'red');
  const rows: Prisma.SdKpiDailyCreateManyInput[] = [];
  for (let d = 14; d >= 1; d--) {
    const wave = Math.sin(d / 2);
    const vals: [string, number, number | null, string | null][] = [
      ['backlog', Math.round(12 + 4 * wave), 10, rag(12 + 4 * wave, 10, 20, false)],
      ['created', Math.round(9 + 3 * wave), null, null],
      ['solved', Math.round(8 + 3 * Math.cos(d)), null, null],
      ['first_response_h', Math.round((2.5 + wave) * 10) / 10, 2, rag(2.5 + wave, 2, 4, false)],
      ['sla_met_pct', Math.round(86 + 6 * Math.cos(d / 3)), 90, rag(86 + 6 * Math.cos(d / 3), 90, 80, true)],
      ['csat_pct', Math.round(88 + 5 * wave), 85, rag(88 + 5 * wave, 85, 70, true)],
    ];
    for (const [metric, value, target, r] of vals) rows.push({ ...dw, day: day(isoDaysAgo(d)), metric, value, target, rag: r });
  }
  await tx.sdKpiDaily.createMany({ data: rows, skipDuplicates: true });
  await tx.sdWallboard.create({ data: { ...org, name: 'IT team screen', deskIds: [it.id], tokenHash: sha256(DEV_WALLBOARD), backlogAlert: 25, createdBy: farah } });
}

/** YukthiX's own support: the platform tenant and its YukthiX Support desk (SD-1.31). */
export async function seedYukthixSupport(tx: Tx, planId: string) {
  await tx.$executeRaw`SELECT set_config('app.sd_system', 'on', true)`;
  const staff = await tx.user.findFirst({ where: { email: 'super@platform.test', organizationId: null }, select: { id: true, name: true } });
  const kaveri = await tx.organization.findUnique({ where: { slug: 'demo-org' }, select: { id: true } });
  const ganga = await tx.organization.findUnique({ where: { slug: 'ganga-textiles' }, select: { id: true } });
  if (!staff || !kaveri) return;
  let platform = await tx.organization.findFirst({ where: { isPlatform: true }, select: { id: true } });
  if (!platform) platform = await tx.organization.upsert({ where: { slug: 'yukthix' }, update: { isPlatform: true }, create: { name: 'YukthiX', slug: 'yukthix', planId, isPlatform: true }, select: { id: true } });
  const org = { organizationId: platform.id };
  if (await tx.sdDesk.findFirst({ where: { ...org, key: 'YXS' } })) return;
  const crypto = new OrgSecretsCryptoService();

  // The staff member's desk user in the platform tenant: never a sign-in of its own (console only).
  const agent = await tx.user.create({ data: { ...org, email: 'anand.iyer@yukthix.test', name: staff.name ?? 'Anand Iyer', passwordHash: '!console-only', role: 'panel', status: 'console_only' } });
  await tx.sdConsoleAgent.create({ data: { ...org, staffUserId: staff.id, userId: agent.id } });

  // Hours: Mon–Sat 9:00–19:00 IST (YX-CONSOLE-03), and round the clock for Severity 1 (YX-CONSOLE-04).
  const hours = await tx.businessCalendar.create({ data: { ...org, name: 'YukthiX support hours', timeZone: 'Asia/Kolkata' } });
  await tx.businessCalendarHours.createMany({ data: [1, 2, 3, 4, 5, 6].map((weekday) => ({ ...org, calendarId: hours.id, weekday, startMinute: 9 * 60, endMinute: 19 * 60, validFrom: day('2026-01-01') })) });
  const allDay = await tx.businessCalendar.create({ data: { ...org, name: 'Round the clock', timeZone: 'Asia/Kolkata' } });
  await tx.businessCalendarHours.createMany({ data: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ ...org, calendarId: allDay.id, weekday, startMinute: 0, endMinute: 1440, validFrom: day('2026-01-01') })) });

  const desk = await tx.sdDesk.create({ data: { ...org, key: 'YXS', name: 'YukthiX Support', kind: 'customer_support', billingClass: 'service_desk', calendarId: hours.id, numberPrefix: 'YXS-' } });
  const w = { ...org, deskId: desk.id };
  await tx.sdCounter.create({ data: { ...w, nextNumber: 2001 } });
  const s = starterFor('customer_support');
  await tx.sdTicketType.createMany({ data: s.types.map((t, i) => ({ ...w, kind: t.kind, name: t.name, sortOrder: i })) });
  await tx.sdStatus.createMany({ data: s.statuses.map((x, i) => ({ ...w, label: x.label, systemState: x.systemState, sortOrder: i })) });
  const group = await tx.sdGroup.create({ data: { ...w, name: 'YukthiX Support team', assignmentMethod: 'manual' } });
  await tx.sdCategory.createMany({ data: s.categories.map((c, i) => ({ ...w, name: c.name, defaultGroupId: group.id, sortOrder: i })) });
  await tx.sdPriorityMatrix.createMany({ data: [1, 2, 3, 4].flatMap((impact) => [1, 2, 3, 4].map((urgency) => ({ ...w, impact, urgency, priority: starterPriority(impact, urgency) }))) });
  await tx.sdDeskMember.create({ data: { ...w, userId: agent.id, role: 'lead', tier: 'L2', validFrom: day('2026-10-01') } });
  await tx.sdGroupMember.create({ data: { ...w, groupId: group.id, userId: agent.id } });
  await tx.sdSupportBridge.create({ data: { ...org, deskId: desk.id } });

  // Targets (P14 Q8): Severity 1 within 1 hour, round the clock, for every customer; Priority Support faster than Standard.
  const policy = async (name: string, sortOrder: number, scope: object, calendar: string | null, firstResponse: number[], resolution: number[]) => {
    const p = await tx.sdSlaPolicy.create({ data: { ...w, name, kind: 'sla', sortOrder } });
    await tx.sdSlaPolicyVersion.create({ data: { ...w, policyId: p.id, version: 1, validFrom: day('2026-01-01'), scope, calendarSource: calendar ? 'calendar' : 'desk', calendarId: calendar, targets: [{ metric: 'first_response', minutes: firstResponse }, { metric: 'resolution', minutes: resolution }], pauseStates: ['pending', 'on_hold'] } });
  };
  await policy('Severity 1, round the clock', 0, { match: 'all', rules: [{ field: 'priority', op: 'in', values: ['1'] }] }, allDay.id, [60, 60, 60, 60], [480, 480, 480, 480]);
  await policy('Priority Support', 1, { match: 'all', rules: [{ field: 'plan', op: 'in', values: ['priority'] }] }, null, [60, 60, 240, 480], [480, 960, 1800, 3600]);
  await policy('Standard support', 2, { match: 'all', rules: [] }, null, [60, 240, 600, 1200], [480, 1440, 3000, 6000]);

  // support@ moves into the desk (US-B-120): the hosted webhook mailbox.
  await tx.sdMailbox.create({ data: { ...org, deskId: desk.id, address: DEV_SUPPORT_MAILBOX.address, kind: 'hosted', displayName: 'YukthiX Support', tokenHash: sha256(DEV_SUPPORT_MAILBOX.token), signingSecretEncrypted: crypto.encrypt(DEV_SUPPORT_MAILBOX.secret), ackText: 'Thank you for writing to YukthiX Support. Your ticket is {{ticket.number}}. Severity 1 is answered within 1 hour, day and night.' } });

  // Customer companies (accounts linked to their tenants) with their support plans.
  const account = async (name: string, domains: string[], tenantId: string, plan: string, tier: string) => {
    const a = await tx.sdCustomerAccount.create({ data: { ...org, name, emailDomains: domains, linkedTenantId: tenantId, ownerUserId: agent.id } });
    await tx.sdEntitlement.create({ data: { ...org, accountId: a.id, plan, tier, channels: ['email', 'portal'], validFrom: day('2026-10-01') } });
    return a;
  };
  const kaveriAcc = await account('Kaveri Foods', ['kaverifoods.test', 'demo-org.test'], kaveri.id, 'Standard support', 'standard');
  if (ganga) await account('Ganga Textiles', ['ganga-textiles.test'], ganga.id, 'Priority Support', 'priority');

  // One open ticket from Kaveri Foods' System Admin, as "Contact YukthiX" makes it.
  const person = await tx.person.create({ data: { ...org, givenName: 'Ramesh', familyName: 'Iyer', primaryEmail: 'admin@demo-org.test' } });
  const contact = await tx.sdCustomerContact.create({ data: { ...org, accountId: kaveriAcc.id, personId: person.id, role: 'primary', seesAccountTickets: true } });
  await tx.personRole.create({ data: { ...org, personId: person.id, roleType: 'external_login', sourceTable: 'sd_customer_contacts', sourceId: contact.id, startOn: day('2026-10-01') } });
  const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`UPDATE sd_counters SET next_number = next_number + 1 WHERE organization_id = ${platform.id}::uuid AND desk_id = ${desk.id}::uuid RETURNING next_number - 1 AS n`;
  const type = await tx.sdTicketType.findFirstOrThrow({ where: w, orderBy: { sortOrder: 'asc' } });
  const status = await tx.sdStatus.findFirstOrThrow({ where: { ...w, label: 'New' } });
  const cat = await tx.sdCategory.findFirstOrThrow({ where: { ...w, name: 'Something is not working' } });
  const at = hoursAgo(2);
  const t = await tx.sdTicket.create({ data: { ...w, seq: n, number: `YXS-${n}`, typeId: type.id, statusId: status.id, priority: 2, categoryId: cat.id, subject: 'Payslips do not open in the mobile app', requesterPersonId: person.id, groupId: group.id, channel: 'portal', customerAccountId: kaveriAcc.id, planTier: 'standard', tags: ['in-app'], custom: { screen: '/yx/people/directory' }, createdAt: at, updatedAt: at } });
  const body = textToHtml('Since this morning our employees see a blank screen when they open a payslip in the mobile app. The web app works. About 40 people are affected.');
  await tx.sdTicketMessage.create({ data: { ...w, ticketId: t.id, kind: 'reply', side: 'requester', authorPersonId: person.id, bodyHtml: body, bodyText: htmlToText(body), channel: 'portal', createdAt: at } });
  await tx.sdTicketEvent.create({ data: { ...w, ticketId: t.id, kind: 'created', toValue: t.number, requesterVisible: true, at } });
}
