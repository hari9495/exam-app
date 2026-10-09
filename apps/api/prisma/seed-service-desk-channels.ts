import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { OrgSecretsCryptoService } from '@exam-platform/shared';
import { starterFor, starterPriority } from '../src/service-desk/starter';
import { htmlToText, textToHtml } from '../src/service-desk/rich-text';

// Service Desk batch 3 demo for Kaveri Foods (M14 SD-1.18 … SD-1.23, SD-1.28), fictional throughout:
//   - the IT desk's support address it-help@kaverifoods.test (hosted webhook) and a Wi-Fi banner with "me too";
//   - a Customer support desk "Kaveri Foods Customer Care" (CARE) with care@kaverifoods.test, IT lead Farah Khan as its
//     lead and Suresh Pillai as agent, the outside portal /yx/portal/demo-org/care, a customer account "Annapurna
//     Stores" (annapurna-stores.test, Gold plan) with two contacts, two products, a known-issue banner and tickets.
// The webhook token and signing secret below are for laptops only (scripts/desk-mail-in.ts uses them); production
// mailboxes get random ones, shown once. Idempotent: skipped once the CARE desk exists.

type Tx = Prisma.TransactionClient;

export const DEV_MAILBOXES = {
  it: { address: 'it-help@kaverifoods.test', token: 'devItHelpMailboxToken-0123456789abcdefABCD', secret: 'dev-it-help-signing-secret-change-me' },
  care: { address: 'care@kaverifoods.test', token: 'devCareMailboxToken-0123456789abcdefABCDEF', secret: 'dev-care-signing-secret-change-me' },
};

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

export async function seedServiceDeskChannels(tx: Tx, organizationId: string) {
  const org = { organizationId };
  await tx.$executeRaw`SELECT set_config('app.sd_system', 'on', true)`;
  if (await tx.sdDesk.findFirst({ where: { ...org, key: 'CARE' } })) return;
  const crypto = new OrgSecretsCryptoService();
  const it = await tx.sdDesk.findFirst({ where: { ...org, key: 'IT' } });
  if (!it) return;
  const admin = await tx.user.findFirstOrThrow({ where: { ...org, email: 'admin@demo-org.test' }, select: { id: true } });
  const farah = await tx.user.findFirstOrThrow({ where: { ...org, email: 'it-lead@demo-org.test' }, select: { id: true } });
  const suresh = await tx.user.findFirstOrThrow({ where: { ...org, email: 'it-agent@demo-org.test' }, select: { id: true } });

  // ---- the IT desk's support address ----
  const mailbox = (deskId: string, m: { address: string; token: string; secret: string }, displayName: string, ackText: string | null) =>
    tx.sdMailbox.create({ data: { ...org, deskId, address: m.address, kind: 'hosted', displayName, tokenHash: sha256(m.token), signingSecretEncrypted: crypto.encrypt(m.secret), ackText, createdBy: admin.id } });
  await mailbox(it.id, DEV_MAILBOXES.it, 'Kaveri Foods IT help', null);

  // ---- the Customer support desk, with its starter set-up (D8) ----
  const cal = await tx.businessCalendar.findFirst({ where: { ...org, name: 'Office hours' } });
  const care = await tx.sdDesk.create({ data: { ...org, key: 'CARE', name: 'Kaveri Foods Customer Care', kind: 'customer_support', billingClass: 'service_desk', calendarId: cal?.id ?? null, numberPrefix: 'CARE-', createdBy: admin.id } });
  const w = { ...org, deskId: care.id };
  await tx.sdCounter.create({ data: { ...w, nextNumber: 501 } });
  const s = starterFor('customer_support');
  await tx.sdTicketType.createMany({ data: s.types.map((t, i) => ({ ...w, kind: t.kind, name: t.name, sortOrder: i })) });
  await tx.sdStatus.createMany({ data: s.statuses.map((x, i) => ({ ...w, label: x.label, systemState: x.systemState, sortOrder: i })) });
  const group = await tx.sdGroup.create({ data: { ...w, name: 'Customer Care team', assignmentMethod: 'manual' } });
  await tx.sdCategory.createMany({ data: s.categories.map((c, i) => ({ ...w, name: c.name, defaultGroupId: group.id, sortOrder: i })) });
  await tx.sdPriorityMatrix.createMany({ data: [1, 2, 3, 4].flatMap((impact) => [1, 2, 3, 4].map((urgency) => ({ ...w, impact, urgency, priority: starterPriority(impact, urgency) }))) });
  for (const [userId, role] of [[farah.id, 'lead'], [suresh.id, 'agent'], [admin.id, 'admin']] as const) {
    await tx.sdDeskMember.create({ data: { ...w, userId, role, tier: role === 'admin' ? null : 'L1', validFrom: day('2026-10-01'), createdBy: admin.id } });
  }
  await tx.sdGroupMember.createMany({ data: [farah.id, suresh.id].map((userId) => ({ ...w, groupId: group.id, userId, createdBy: admin.id })) });
  await mailbox(care.id, DEV_MAILBOXES.care, 'Kaveri Foods Customer Care', 'Thank you for writing to Kaveri Foods. Your ticket number is {{ticket.number}}. We reply within one working day.');

  // ---- products, the account and its contacts (SD-1.28) ----
  await tx.sdProduct.createMany({ data: [{ ...org, name: 'Online orders', deskId: care.id, createdBy: admin.id }, { ...org, name: 'Ready-to-cook mixes', createdBy: admin.id }] });
  const account = await tx.sdCustomerAccount.create({ data: { ...org, name: 'Annapurna Stores', emailDomains: ['annapurna-stores.test'], ownerUserId: farah.id, createdBy: admin.id } });
  await tx.sdEntitlement.create({ data: { ...org, accountId: account.id, plan: 'Gold support', tier: 'gold', ticketsAllowed: 50, channels: ['email', 'portal'], validFrom: day('2026-10-01'), createdBy: admin.id } });
  const contact = async (given: string, family: string, email: string, role: string, seesAccountTickets: boolean) => {
    const p = await tx.person.create({ data: { ...org, givenName: given, familyName: family, primaryEmail: email, createdBy: admin.id } });
    const c = await tx.sdCustomerContact.create({ data: { ...org, accountId: account.id, personId: p.id, role, seesAccountTickets, createdBy: admin.id } });
    await tx.personRole.create({ data: { ...org, personId: p.id, roleType: 'external_login', sourceTable: 'sd_customer_contacts', sourceId: c.id, startOn: day('2026-10-01') } });
    return p.id;
  };
  const asha = await contact('Asha', 'Menon', 'asha@annapurna-stores.test', 'primary', true);
  const ravi = await contact('Ravi', 'Kumar', 'ravi@annapurna-stores.test', 'member', false);

  // ---- the outside portal (SD-1.21, SD-1.22) ----
  const portal = await tx.sdPortal.create({
    data: {
      ...org,
      slug: 'care',
      name: 'Kaveri Foods Customer Care',
      signUp: 'allowed_domains',
      allowedDomains: ['annapurna-stores.test'],
      openRequests: true,
      accentColour: '#b45309',
      loginTitle: 'Help for Kaveri Foods customers',
      loginText: 'Sign in with your work email. We send you a one-time code; no password needed.',
      createdBy: admin.id,
    },
  });
  await tx.sdPortalDesk.create({ data: { ...org, portalId: portal.id, deskId: care.id } });

  // ---- tickets ----
  const raise = async (d: { id: string; key: string }, o: { subject: string; text: string; category: string; requester: string; status?: string; channel: string; hoursAgo: number; accountId?: string; plan?: string; assignee?: string }) => {
    const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`UPDATE sd_counters SET next_number = next_number + 1 WHERE organization_id = ${organizationId}::uuid AND desk_id = ${d.id}::uuid RETURNING next_number - 1 AS n`;
    const dw = { ...org, deskId: d.id };
    const cat = await tx.sdCategory.findFirstOrThrow({ where: { ...dw, name: o.category } });
    const type = await tx.sdTicketType.findFirstOrThrow({ where: dw, orderBy: { sortOrder: 'asc' } });
    const status = await tx.sdStatus.findFirstOrThrow({ where: { ...dw, label: o.status ?? 'New' } });
    const at = hoursAgo(o.hoursAgo);
    const t = await tx.sdTicket.create({
      data: { ...dw, seq: n, number: `${d.key}-${n}`, typeId: type.id, statusId: status.id, priority: 3, categoryId: cat.id, subject: o.subject, requesterPersonId: o.requester, assigneeUserId: o.assignee ?? null, groupId: cat.defaultGroupId, channel: o.channel, customerAccountId: o.accountId ?? null, planTier: o.plan ?? null, createdAt: at, updatedAt: at },
    });
    const body = textToHtml(o.text);
    await tx.sdTicketMessage.create({ data: { ...dw, ticketId: t.id, kind: 'reply', side: 'requester', authorPersonId: o.requester, bodyHtml: body, bodyText: htmlToText(body), channel: o.channel, createdAt: at } });
    await tx.sdTicketEvent.create({ data: { ...dw, ticketId: t.id, kind: 'created', toValue: t.number, requesterVisible: true, at } });
    return t;
  };
  const late = await raise({ id: care.id, key: 'CARE' }, { subject: 'Order 4471 has not arrived', text: 'We ordered 40 packs of rava idli mix on Monday. The tracking page still says "packed".', category: 'Something is not working', requester: asha, status: 'Open', channel: 'portal', hoursAgo: 20, accountId: account.id, plan: 'gold', assignee: suresh.id });
  const reply = textToHtml('Hello Asha, thank you for waiting. The order left our Mysuru warehouse today and should reach you tomorrow.');
  await tx.sdTicketMessage.create({ data: { ...org, deskId: care.id, ticketId: late.id, kind: 'reply', side: 'agent', authorUserId: suresh.id, bodyHtml: reply, bodyText: htmlToText(reply), channel: 'agent', createdAt: hoursAgo(18) } });
  await tx.sdTicket.update({ where: { id: late.id }, data: { firstResponseAt: hoursAgo(18) } });
  const tracking = await raise({ id: care.id, key: 'CARE' }, { subject: 'Order tracking page shows old status', text: 'The tracking page has not updated since this morning for any of our orders.', category: 'Something is not working', requester: ravi, channel: 'email', hoursAgo: 3, accountId: account.id, plan: 'gold' });

  // ---- known-issue banners (SD-1.23) ----
  await tx.sdBanner.create({ data: { ...org, deskId: care.id, audience: 'customers', text: 'Order tracking is slow today. Your orders are on their way; we are fixing the page.', severity: 'warning', ticketId: tracking.id, createdBy: suresh.id } });
  const divya = (await tx.employee.findFirstOrThrow({ where: { ...org, workEmail: 'divya.raghunathan@kaverifoods.test' }, select: { personId: true } })).personId!;
  const wifi = await raise({ id: it.id, key: 'IT' }, { subject: 'Wi-Fi down on the 2nd floor', text: 'No Wi-Fi near the canteen since 10 am.', category: 'Network and Wi-Fi', requester: divya, channel: 'portal', hoursAgo: 1, assignee: suresh.id });
  await tx.sdBanner.create({ data: { ...org, deskId: it.id, audience: 'employees', text: 'Wi-Fi on the 2nd floor is down. We are on it; no need to raise a ticket.', severity: 'outage', ticketId: wifi.id, createdBy: suresh.id } });
}
