import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { NotificationsService } from '../notifications/notifications.service';
import { escapeHtml, buildNotificationEmailFooter } from '../notifications/notification-email-render';
import { csatOf, npsOf, tenantHealth } from '../service-desk/tenant-health';
import { PLATFORM, platformRead, staffActor } from './platform.service';
import type { CsSettingsDto, CsMessageDto, CsDecisionDto } from './customer-success.dto';

type Tx = Prisma.TransactionClient;

/**
 * Answer 1047: the churn alert thresholds are platform settings with defaults, changed by staff with the Customer
 * success key (audited). A missing row means the default.
 */
export const CS_SETTINGS = {
  'cs.alert.health_below': { label: 'Alert when the health score is below', default: 50, min: 1, max: 99 },
  'cs.alert.admin_idle_days': { label: 'Alert when no System Admin has signed in for (days)', default: 30, min: 7, max: 365 },
  // Answer 1165: how long the nightly health snapshots are kept before the nightly purge.
  'cs.snapshot.keep_days': { label: 'Keep daily health snapshots for (days)', default: 400, min: 31, max: 1825 },
} as const;
export type CsSettingKey = keyof typeof CS_SETTINGS;
export type CsSettings = Record<CsSettingKey, number>;

const OPEN_STATES = ['new', 'open', 'pending', 'on_hold'];
const companyCtx = (organizationId: string): TenantContext => ({ organizationId, isSuperAdmin: false });

export type AlertRule = 'health_below' | 'admin_idle';

/** The churn alerts for one company's row, each with its rule (answer 1047; the rule keeps a follow-up, 1165). */
export function alertRulesFor(row: { health: number; adminLastSignIn: Date | null }, s: CsSettings, now = new Date()): { rule: AlertRule; text: string }[] {
  const out: { rule: AlertRule; text: string }[] = [];
  if (row.health < s['cs.alert.health_below']) out.push({ rule: 'health_below', text: `Health score below ${s['cs.alert.health_below']}` });
  const idle = row.adminLastSignIn ? Math.floor((now.getTime() - row.adminLastSignIn.getTime()) / 86_400_000) : null;
  if (idle === null || idle >= s['cs.alert.admin_idle_days']) out.push({ rule: 'admin_idle', text: idle === null ? 'No System Admin has ever signed in' : `No System Admin sign-in for ${idle} days` });
  return out;
}

/** The churn alerts for one company's row (answer 1047). */
export function alertsFor(row: { health: number; adminLastSignIn: Date | null }, s: CsSettings, now = new Date()): string[] {
  return alertRulesFor(row, s, now).map((a) => a.text);
}

export type HealthBandKey = 'healthy' | 'watch' | 'at_risk';
/** The drawn bands (YX-04 healthBand): 70 and up healthy, 45 to 69 watch, below 45 at risk. */
export const bandOf = (score: number): HealthBandKey => (score >= 70 ? 'healthy' : score >= 45 ? 'watch' : 'at_risk');
/** The drawn churn risk column, from the band (answer 1082). */
export const CHURN_OF: Record<HealthBandKey, 'low' | 'medium' | 'high'> = { healthy: 'low', watch: 'medium', at_risk: 'high' };

/** India day "YYYY-MM-DD" plus n days (calendar arithmetic in UTC on the date only, so month ends are exact). */
export const dayPlus = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const istDay = (now = new Date()) => new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);

/**
 * Answer 1082: the 30-day change: today's score less the score of the latest snapshot on or before 30 days ago (a missed
 * night uses the one before); null without one.
 */
export function thirtyDayChange(today: string, score: number, snapshots: { day: string; score: number }[]): number | null {
  const cut = dayPlus(today, -30);
  const base = snapshots.filter((s) => s.day <= cut).sort((a, b) => (a.day < b.day ? 1 : -1))[0];
  return base ? score - base.score : null;
}

/**
 * YukthiX console C-2, Customer success (answers 1047, 1048): the tenant health list with churn alerts, and messages
 * from staff to companies' System Admins. Account facts only, never HR data; every cross-company read goes through the
 * audited platformRead. A message to one company is sent at once; to more than one, a second staff member (never the
 * writer) approves it. Each sent message goes to the company's own copy (forced RLS), its System Admins' bell and email
 * (their email choices), and the company's audit log.
 */
@Injectable()
export class CustomerSuccessService {
  private readonly logger = new Logger(CustomerSuccessService.name);
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ------------------------------------------------------------------------------------------ settings

  private async readSettings(tx: Tx): Promise<CsSettings> {
    const rows = await tx.platformSetting.findMany({ where: { key: { in: Object.keys(CS_SETTINGS) } } });
    const out = {} as CsSettings;
    for (const k of Object.keys(CS_SETTINGS) as CsSettingKey[]) {
      const v = Number(rows.find((r) => r.key === k)?.value);
      out[k] = Number.isInteger(v) ? v : CS_SETTINGS[k].default;
    }
    return out;
  }

  settings() {
    return this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const values = await this.readSettings(tx);
      return (Object.keys(CS_SETTINGS) as CsSettingKey[]).map((key) => ({ key, label: CS_SETTINGS[key].label, value: values[key], default: CS_SETTINGS[key].default, min: CS_SETTINGS[key].min, max: CS_SETTINGS[key].max }));
    });
  }

  async saveSettings(actorUserId: string, dto: CsSettingsDto) {
    const changes = Object.entries(dto.values) as [string, number][];
    for (const [k, v] of changes) {
      const def = CS_SETTINGS[k as CsSettingKey];
      if (!def) throw new BadRequestException(`Unknown setting: ${k}.`);
      if (!Number.isInteger(v) || v < def.min || v > def.max) throw new BadRequestException(`${def.label}: give a whole number from ${def.min} to ${def.max}.`);
    }
    await this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const before = await this.readSettings(tx);
      for (const [key, v] of changes) await tx.platformSetting.upsert({ where: { key }, create: { key, value: String(v), updatedBy: actorUserId }, update: { value: String(v), updatedBy: actorUserId } });
      const after = await this.readSettings(tx);
      await AuditService.recordIn(tx, PLATFORM, { actorUserId, action: 'platform.cs.settings_changed', entityType: 'platform_setting', metadata: { before, after } });
    });
    return this.settings();
  }

  // ------------------------------------------------------------------------------------------ health and alerts

  /** Every customer company with its health score and churn alerts. One audited cross-company read. */
  async health(actorUserId: string, now = new Date()) {
    return platformRead(this.tenantPrisma, actorUserId, 'customer_success.health', async (tx) => {
      const { settings, rows } = await this.healthRows(tx, now);
      const today = istDay(now);
      const ids = rows.map((r) => r.id);
      const [snaps, accounts] = await Promise.all([
        tx.csHealthSnapshot.findMany({ where: { organizationId: { in: ids }, day: { lte: new Date(`${dayPlus(today, -30)}T00:00:00Z`), gte: new Date(`${dayPlus(today, -60)}T00:00:00Z`) } }, select: { organizationId: true, day: true, score: true } }),
        tx.csAccount.findMany({ where: { organizationId: { in: ids } } }),
      ]);
      const owners = await tx.user.findMany({ where: { id: { in: accounts.map((a) => a.ownerUserId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true, email: true } });
      return {
        settings,
        rows: rows.map(({ alertRules: _rules, ...r }) => {
          void _rules;
          const band = bandOf(r.health);
          const ownerId = accounts.find((a) => a.organizationId === r.id)?.ownerUserId ?? null;
          const owner = owners.find((o) => o.id === ownerId);
          return {
            ...r,
            band,
            churn: CHURN_OF[band],
            trend: thirtyDayChange(today, r.health, snaps.filter((s) => s.organizationId === r.id).map((s) => ({ day: s.day.toISOString().slice(0, 10), score: s.score }))),
            owner: owner ? { id: owner.id, name: owner.name?.trim() || owner.email } : null,
          };
        }),
      };
    });
  }

  /** Every customer company's score, factors and alerts (no audit row: the caller's read is audited, or the nightly job). */
  async healthRows(tx: Tx, now = new Date()) {
    {
      const settings = await this.readSettings(tx);
      const orgs = await tx.organization.findMany({ where: { isPlatform: false, lifecycle: { not: 'closed' } }, select: { id: true, name: true, slug: true, lifecycle: true, billingStatus: true }, orderBy: { name: 'asc' }, take: 2000 });
      const ids = orgs.map((o) => o.id);
      const [products, admins] = await Promise.all([
        tx.organizationProduct.findMany({ where: { organizationId: { in: ids } }, select: { organizationId: true, productCode: true } }),
        tx.user.groupBy({ by: ['organizationId'], where: { organizationId: { in: ids }, role: 'org_admin', lastLoginAt: { not: null } }, _max: { lastLoginAt: true } }),
      ]);
      // Signals from the YukthiX Support desk (the platform tenant): open tickets, ratings and NPS per linked company.
      const desk = await tx.organization.findFirst({ where: { isPlatform: true }, select: { id: true } });
      const accounts = desk ? await tx.sdCustomerAccount.findMany({ where: { organizationId: desk.id, linkedTenantId: { in: ids } }, select: { id: true, linkedTenantId: true } }) : [];
      const accIds = accounts.map((a) => a.id);
      const [tickets, surveys] = desk && accIds.length
        ? await Promise.all([
            tx.sdTicket.findMany({ where: { organizationId: desk.id, customerAccountId: { in: accIds } }, select: { id: true, customerAccountId: true, systemState: true } }),
            tx.sdSurveyResponse.findMany({ where: { organizationId: desk.id, accountId: { in: accIds } }, select: { accountId: true, score: true }, orderBy: { createdAt: 'desc' } }),
          ])
        : [[], []];
      const ratings = desk && tickets.length ? await tx.sdRating.findMany({ where: { organizationId: desk.id, ticketId: { in: tickets.map((t) => t.id) } }, select: { ticketId: true, score: true } }) : [];
      const ticketAccount = new Map(tickets.map((t) => [t.id, t.customerAccountId]));
      const rows = orgs.map((o) => {
        const acc = accounts.filter((a) => a.linkedTenantId === o.id).map((a) => a.id);
        const open = tickets.filter((t) => acc.includes(t.customerAccountId!) && OPEN_STATES.includes(t.systemState)).length;
        const csat = csatOf(ratings.filter((r) => acc.includes(ticketAccount.get(r.ticketId) ?? '')).map((r) => r.score));
        const nps = npsOf(surveys.filter((s) => acc.includes(s.accountId ?? '')).slice(0, 20).map((s) => s.score));
        const adminLastSignIn = admins.find((a) => a.organizationId === o.id)?._max.lastLoginAt ?? null;
        const { health, factors } = tenantHealth({ lifecycle: o.lifecycle, billingStatus: o.billingStatus, adminLastSignIn, open, csat, nps }, now);
        const row = { id: o.id, name: o.name, slug: o.slug, lifecycle: o.lifecycle, products: products.filter((p) => p.organizationId === o.id).map((p) => p.productCode), health, factors, adminLastSignIn, openTickets: open };
        const rules = alertRulesFor(row, settings, now);
        return { ...row, alerts: rules.map((a) => a.text), alertRules: rules };
      });
      return { settings, rows };
    }
  }

  // ------------------------------------------------------------------------------------------ messages

  async messages(actorUserId: string) {
    return this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const rows = await tx.yukthixMessage.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
      const people = new Map((await tx.user.findMany({ where: { id: { in: [...new Set(rows.flatMap((r) => [r.writtenBy, r.decidedBy].filter((x): x is string => !!x)))] } }, select: { id: true, name: true, email: true } })).map((u) => [u.id, u.name?.trim() || u.email]));
      return rows.map((r) => ({
        id: r.id,
        subject: r.subject,
        body: r.body,
        companyIds: r.companyIds,
        status: r.status,
        writtenBy: people.get(r.writtenBy) ?? '',
        mine: r.writtenBy === actorUserId,
        decidedBy: r.decidedBy ? (people.get(r.decidedBy) ?? '') : null,
        decidedAt: r.decidedAt,
        decisionNote: r.decisionNote,
        sentAt: r.sentAt,
        createdAt: r.createdAt,
        version: r.version,
        ruleSetId: r.ruleSetId,
      }));
    });
  }

  /** Writes a message. One company: sent at once. More than one: waits for a second staff member. */
  async write(actorUserId: string, dto: CsMessageDto, ruleSetId: string | null = null) {
    const companyIds = [...new Set(dto.companyIds)];
    const id = await platformRead(this.tenantPrisma, actorUserId, 'customer_success.message', async (tx) => {
      const found = await tx.organization.findMany({ where: { id: { in: companyIds }, isPlatform: false, lifecycle: { not: 'closed' } }, select: { id: true } });
      if (found.length !== companyIds.length) throw new BadRequestException('Choose companies that are open (not closed).');
      if (ruleSetId && (await tx.yukthixMessage.findFirst({ where: { ruleSetId, status: { in: ['pending_approval', 'sent'] } }, select: { id: true } }))) {
        throw new ConflictException('A notice about this rule set is already waiting or sent.');
      }
      const m = await tx.yukthixMessage.create({ data: { subject: dto.subject.trim(), body: dto.body.trim(), companyIds, status: 'pending_approval', writtenBy: actorUserId, ruleSetId } });
      await AuditService.recordIn(tx, PLATFORM, { actorUserId, action: 'platform.message.written', entityType: 'yukthix_message', entityId: m.id, metadata: { subject: m.subject, companies: companyIds.length, ...(ruleSetId ? { ruleSetId } : {}) } });
      return m.id;
    });
    if (companyIds.length === 1) await this.send(actorUserId, id, null);
    return this.messages(actorUserId);
  }

  /**
   * Answer 1065: a notice about a published rule set, to the System Admins of every open company with a location in the
   * rule's country (`IN`) or state (`IN-KA`). It is an admin message like any other: more than one company waits for a
   * second staff member. One live notice per rule set.
   */
  async ruleNotice(actorUserId: string, ruleSetId: string, dto: Omit<CsMessageDto, 'companyIds'>) {
    const companyIds = await platformRead(this.tenantPrisma, actorUserId, `rule notice: companies for rule set ${ruleSetId}`, async (tx) => {
      const rule = await tx.statutoryRuleSet.findUnique({ where: { id: ruleSetId }, select: { status: true, jurisdiction: true } });
      if (!rule) throw new NotFoundException('Rule set not found.');
      if (rule.status !== 'published') throw new ConflictException('Send a notice once the rule set is published.');
      const place = rule.jurisdiction.length === 2 ? { country: rule.jurisdiction } : { state: rule.jurisdiction };
      const there = await tx.location.findMany({ where: { ...place, archivedAt: null }, distinct: ['organizationId'], select: { organizationId: true } });
      const orgs = await tx.organization.findMany({ where: { id: { in: there.map((l) => l.organizationId) }, isPlatform: false, lifecycle: { not: 'closed' } }, select: { id: true } });
      return orgs.map((o) => o.id);
    });
    if (!companyIds.length) throw new ConflictException('No open company has a location there, so nobody needs the notice.');
    return this.write(actorUserId, { ...dto, companyIds }, ruleSetId);
  }

  /** Answer 1087: the writer takes back their own message while it waits for approval. It can never be approved after. */
  async withdraw(actorUserId: string, id: string, dto: CsDecisionDto) {
    await this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const m = await tx.yukthixMessage.findUnique({ where: { id } });
      if (!m) throw new NotFoundException('Message not found.');
      if (m.writtenBy !== actorUserId) throw new ForbiddenException('Only the writer withdraws a message.');
      const done = await tx.yukthixMessage.updateMany({ where: { id, status: 'pending_approval', version: dto.version }, data: { status: 'withdrawn', decidedAt: new Date(), decisionNote: dto.note?.trim() || null, version: { increment: 1 } } });
      if (!done.count) throw new ConflictException('This message is no longer waiting for approval.');
      await AuditService.recordIn(tx, PLATFORM, { actorUserId, action: 'platform.message.withdrawn', entityType: 'yukthix_message', entityId: id, metadata: { subject: m.subject, companies: m.companyIds.length, reason: dto.note?.trim() || null } });
    });
    return this.messages(actorUserId);
  }

  /** A second staff member approves a message to more than one company, and it is sent. Never the writer. */
  async approve(actorUserId: string, id: string, dto: CsDecisionDto) {
    await this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const m = await tx.yukthixMessage.findUnique({ where: { id } });
      if (!m) throw new NotFoundException('Message not found.');
      if (m.writtenBy === actorUserId) throw new ForbiddenException('You wrote this message. Another staff member approves it.');
      if (m.status !== 'pending_approval') throw new ConflictException('This message is no longer waiting for approval.');
      if (m.version !== dto.version) throw new ConflictException('Someone changed this message since you opened it. Open it again.');
    });
    await this.send(actorUserId, id, dto.version);
    return this.messages(actorUserId);
  }

  async reject(actorUserId: string, id: string, dto: CsDecisionDto) {
    if (!dto.note?.trim()) throw new BadRequestException('Give a reason for sending it back.');
    await this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const m = await tx.yukthixMessage.findUnique({ where: { id } });
      if (!m) throw new NotFoundException('Message not found.');
      if (m.writtenBy === actorUserId) throw new ForbiddenException('You wrote this message. Another staff member decides on it.');
      const done = await tx.yukthixMessage.updateMany({ where: { id, status: 'pending_approval', version: dto.version }, data: { status: 'rejected', decidedBy: actorUserId, decidedAt: new Date(), decisionNote: dto.note!.trim(), version: { increment: 1 } } });
      if (!done.count) throw new ConflictException('This message is no longer waiting for approval.');
      await AuditService.recordIn(tx, PLATFORM, { actorUserId, action: 'platform.message.rejected', entityType: 'yukthix_message', entityId: id, metadata: { subject: m.subject, reason: dto.note!.trim() } });
    });
    return this.messages(actorUserId);
  }

  /**
   * Sends to each company: its own copy, an audit row the company sees, then its System Admins' bell and email. Safe to
   * re-run: a company that already has the message is skipped (no second notice).
   */
  private async send(actorUserId: string, id: string, version: number | null) {
    const actor = await staffActor(this.tenantPrisma, actorUserId);
    const m = await this.tenantPrisma.forTenant(PLATFORM, (tx) => tx.yukthixMessage.findUniqueOrThrow({ where: { id } }));
    const appBaseUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const html = `<p>${escapeHtml(m.body).replace(/\n/g, '<br />')}</p><p>From the YukthiX team. You also find this message in Settings › Support access.</p>${buildNotificationEmailFooter(appBaseUrl)}`;
    for (const org of m.companyIds) {
      const ctx = companyCtx(org);
      const delivery = await this.tenantPrisma.forTenant(ctx, async (tx) => {
        const had = await tx.companyMessage.findFirst({ where: { organizationId: org, messageId: m.id }, select: { id: true } });
        if (had) return null;
        const row = await tx.companyMessage.create({ data: { organizationId: org, messageId: m.id, subject: m.subject, body: m.body } });
        await AuditService.recordIn(tx, ctx, { actorUserId, actor, action: 'yukthix.message.received', entityType: 'company_message', entityId: row.id, metadata: { subject: m.subject } });
        const admins = await tx.user.findMany({ where: { organizationId: org, role: 'org_admin', status: 'active' }, select: { id: true } });
        return { row, admins: admins.map((a) => a.id) };
      });
      if (!delivery) continue;
      await this.notifications
        .notifySystem(ctx, delivery.admins, 'yukthix.admin_message', { entityType: 'company_message', entityId: delivery.row.id, contextText: m.subject, linkPath: '/yx/settings/support-access#messages' }, { subject: `Message from YukthiX: ${m.subject}`, html })
        .catch((e) => this.logger.warn(`YukthiX message notice for ${org} failed: ${(e as Error).message}`));
    }
    await this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const data = version === null ? { status: 'sent', sentAt: new Date(), version: { increment: 1 } } : { status: 'sent', sentAt: new Date(), decidedBy: actorUserId, decidedAt: new Date(), version: { increment: 1 } };
      await tx.yukthixMessage.updateMany({ where: { id, status: 'pending_approval' }, data });
      await AuditService.recordIn(tx, PLATFORM, { actorUserId, action: 'platform.message.sent', entityType: 'yukthix_message', entityId: id, metadata: { subject: m.subject, companies: m.companyIds.length, approved: version !== null } });
    });
  }

  // ------------------------------------------------------------------------------------------ the company side

  /** The messages YukthiX sent to this company (its own copies only; RLS). */
  forCompany(ctx: TenantContext) {
    return this.tenantPrisma.forTenant(ctx, (tx) => tx.companyMessage.findMany({ where: { organizationId: ctx.organizationId as string }, orderBy: { sentAt: 'desc' }, take: 50, select: { id: true, subject: true, body: true, sentAt: true } }));
  }
}
