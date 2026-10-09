import { Prisma } from '@prisma/client';
import { randomBytes, createHash } from 'crypto';
import { DateTime } from 'luxon';
import { OrgSecretsCryptoService } from '@exam-platform/shared';

// Service Desk phase 3b-2 batch 3 demo for Kaveri Foods (fictional throughout):
//   - the IT desk takes WhatsApp, SMS and Microsoft Teams on YukthiX's shared number and app (the dev transport keeps
//     what would be sent; the approved WhatsApp template and the DLT SMS templates are marked approved for the demo);
//   - Arjun (arjun@demo-org.test) linked his phone +91 98000 00101 for WhatsApp and SMS (each with its opt-in record)
//     and Microsoft Teams;
//   - routing: Farah answers in English and Hindi, Suresh in English and Tamil; Suresh takes at most 2 live chats;
//   - two shifts today on the IT desk (Farah 09:00–17:00, Suresh 13:00–21:00, India time) and their presence;
//   - 8 weeks of daily new-ticket counts on the IT desk (busier on Mondays) for the staff forecast;
//   - a help widget "Website help" on the Customer Care help page for http://localhost:5173.
// Idempotent: skipped once the IT desk has its WhatsApp line.

type Tx = Prisma.TransactionClient;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const DEMO_PHONE = '+919800000101';

export async function seedServiceDeskEsm3(tx: Tx, organizationId: string) {
  const org = { organizationId };
  await tx.$executeRaw`SELECT set_config('app.sd_system', 'on', true)`;
  const it = await tx.sdDesk.findFirst({ where: { ...org, key: 'IT' } });
  if (!it || (await tx.sdMsgChannel.findFirst({ where: { ...org, kind: 'whatsapp' } }))) return;
  const crypto = new OrgSecretsCryptoService();
  const admin = await tx.user.findFirstOrThrow({ where: { ...org, email: 'admin@demo-org.test' }, select: { id: true } });
  const farah = await tx.user.findFirstOrThrow({ where: { ...org, email: 'it-lead@demo-org.test' }, select: { id: true } });
  const suresh = await tx.user.findFirstOrThrow({ where: { ...org, email: 'it-agent@demo-org.test' }, select: { id: true } });
  const arjun = await tx.user.findFirstOrThrow({ where: { ...org, email: 'arjun@demo-org.test' }, select: { id: true } });
  const arjunPerson = await tx.personRole.findFirstOrThrow({ where: { ...org, roleType: 'login', sourceTable: 'users', sourceId: arjun.id, endOn: null }, select: { personId: true } });

  // ---- the IT desk's lines on YukthiX's shared number and app (SD-2.21 … SD-2.23) ----
  const line = (kind: string, name: string, templates: object) =>
    tx.sdMsgChannel.create({ data: { ...org, deskId: it.id, kind, name, tokenHash: sha256(randomBytes(32).toString('base64url')), signingSecretEncrypted: crypto.encrypt(randomBytes(32).toString('base64url')), templates: templates as Prisma.InputJsonValue, createdBy: admin.id } });
  await line('whatsapp', 'IT help on WhatsApp', { reply_notice: { name: 'desk_reply_notice', language: 'en', status: 'approved' } });
  await line('sms', 'IT help by SMS', {
    reply_notice: { dltTemplateId: '1107000000000000101', body: 'New reply on your request {#var#}: {#var#} Reply to this SMS or open YukthiX. -KAVERI', status: 'approved' },
    notice: { dltTemplateId: '1107000000000000102', body: 'Kaveri IT help: {#var#} -KAVERI', status: 'approved' },
  });
  await line('teams', 'IT help in Teams', {});

  // ---- Arjun's phone (the opt-in records) and Teams ----
  for (const kind of ['whatsapp', 'sms'] as const) {
    const hash = crypto.hmac('desk-msg-address', DEMO_PHONE);
    const consent = await tx.channelConsent.create({ data: { ...org, recipientType: 'user', recipientId: arjun.id, channel: kind, addressHash: hash, addressMasked: '+91••••••••01', scope: 'all_service', source: `${kind}_join`, textVersion: 'desk-join-v1', language: 'en', capturedBy: arjun.id, evidence: { seeded: true } } });
    await tx.sdMsgIdentity.create({ data: { ...org, kind, userId: arjun.id, personId: arjunPerson.personId, addressHash: hash, addressMasked: '+91••••••••01', addressEncrypted: crypto.encrypt(DEMO_PHONE), consentId: consent.id } });
  }
  if (!(await tx.channelLink.findFirst({ where: { ...org, userId: arjun.id, provider: 'teams' } }))) {
    await tx.channelLink.create({ data: { ...org, userId: arjun.id, provider: 'teams', externalRef: 'arjun.kulkarni@kaverifoods.onmicrosoft.test', label: 'Microsoft Teams' } });
  }

  // ---- routing: skills, languages, capacity (SD-2.25) ----
  await tx.sdDeskMember.updateMany({ where: { ...org, deskId: it.id, userId: farah.id }, data: { languages: ['en', 'hi'] } });
  await tx.sdDeskMember.updateMany({ where: { ...org, deskId: it.id, userId: suresh.id }, data: { languages: ['en', 'ta'] } });
  await tx.sdAgentCapacity.create({ data: { ...org, userId: suresh.id, channel: 'chat', maxOpen: 2, updatedBy: farah.id } });

  // ---- two shifts today and presence (SD-2.26) ----
  const today = DateTime.now().setZone('Asia/Kolkata').startOf('day');
  await tx.sdShift.create({ data: { ...org, deskId: it.id, userId: farah.id, startsAt: today.set({ hour: 9 }).toJSDate(), endsAt: today.set({ hour: 17 }).toJSDate(), note: 'Day shift', createdBy: farah.id } });
  await tx.sdShift.create({ data: { ...org, deskId: it.id, userId: suresh.id, startsAt: today.set({ hour: 13 }).toJSDate(), endsAt: today.set({ hour: 21 }).toJSDate(), note: 'Late shift', createdBy: farah.id } });
  for (const u of [farah.id, suresh.id]) await tx.sdAgentPresenceLog.create({ data: { ...org, userId: u, status: 'available', startedAt: today.set({ hour: 9 }).toJSDate() } });

  // ---- 8 weeks of new tickets per day on the IT desk, for the forecast ----
  const rows = Array.from({ length: 56 }, (_, i) => {
    const d = today.minus({ days: 56 - i });
    const base = d.weekday === 1 ? 18 : d.weekday >= 6 ? 3 : 10;
    return { ...org, deskId: it.id, day: new Date(`${d.toISODate()}T00:00:00Z`), metric: 'created', value: base + ((i * 7) % 5) };
  });
  await tx.sdKpiDaily.createMany({ data: rows, skipDuplicates: true });

  // ---- a help widget on the Customer Care page (SD-2.20) ----
  const care = await tx.sdPortal.findFirst({ where: { ...org, slug: 'care' }, select: { id: true } });
  if (care) {
    await tx.sdWidget.create({ data: { ...org, portalId: care.id, key: `wk_${randomBytes(18).toString('base64url')}`, name: 'Website help', allowedOrigins: ['http://localhost:5173'], identitySecretEncrypted: crypto.encrypt(randomBytes(32).toString('base64url')), allowAnonymous: true, createdBy: admin.id } });
  }
}
