import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { buildViewer, tenantWide, type ScopeUser } from '../access/scope';
import { audit, CompanyContext, inCompany, Tx } from '../org-structure/org-structure.service';
import { IN_STATES, todayIst } from '../org-structure/org-validation';
import { OrgSettingsService } from '../org-structure/org-settings.service';
import { SETTINGS } from '../org-structure/settings-registry';
import { settingFor } from '../people/probation';
import { gstinProblem } from '../expenses/checks';
import { dayBefore, financialYear, marginPct, rateChangeProblem, toPaise, toRupees } from './staffing-rules';
import type { ClientContactDto, ClientDto, InvoiceSeriesDto, RateChangeDto, RateLineDto } from './staffing-dto';

/** Settings 6.2 Staffing desk: the company settings the page shows (slice 1). */
export const STAFFING_SETTING_KEYS = [
  'staffing.desk.enabled',
  // Answer 491: where client portal tickets go.
  'staffing.portal.tickets_team',
  'staffing.ot_multiplier',
  'staffing.holiday_multiplier',
  'staffing.payment_terms_days',
  'staffing.rate_change.backdate_days',
  // Slice 2.
  'staffing.vendor.target_margin_pct',
  'staffing.vendor.ownership_days',
  'staffing.submission.mask_contact',
  'staffing.placement.ending_soon_days',
  'staffing.statutory_cost_pct',
  'staffing.bench.pay_pct',
  'staffing.bench.max_days',
  'staffing.bench.after',
  'staffing.dunning.schedule',
  'staffing.einvoice.applies',
  'staffing.export.ledger.sales',
  'staffing.export.ledger.cgst',
  'staffing.export.ledger.sgst',
  'staffing.export.ledger.igst',
  'staffing.export.ledger.gst',
  'staffing.export.ledger.tds',
  'staffing.export.ledger.round_off',
  'staffing.export.gst_split',
  'staffing.export.tds',
  'staffing.export.round_off',
] as const;
const KEYS = ['ats.staffing.manage', 'ats.staffing.view', 'org.settings.manage', 'ats.agency.manage', 'ats.staffing.billing'] as const;
type Access = { manage: boolean; view: boolean; settings: boolean; vendorRates: boolean; billing: boolean; actingForOther: boolean };

/**
 * Staffing desk slice 1 (HIR-14 clients, HIR-15 rate cards, Settings 6.2). A company turns the desk on (setting
 * staffing.desk.enabled, default off); until then the desk's pages and API refuse (403). Account managers
 * (ats.staffing.manage) keep clients, contacts and dated rate cards with pay rates; recruiters (ats.staffing.view) read
 * clients and bill rates, never pay rates or margins. Money is paise (BigInt), never floating point. Every write is
 * audited with what changed; nothing is written while acting for someone else; another company's records are not found.
 */
/**
 * Answer 484: the statutory cost default is 13% (employer PF and ESI) when any legal entity of the company has a PF or
 * ESI registration that is on or applied for (statutory_registrations.statute IN.PF / IN.ESI, status on or
 * applied_awaited: the same rows payroll uses), else 0%. A value HR saved on 6.2 always wins.
 */
export async function statutoryCostDefault(tx: Tx, org: string) {
  const n = await tx.statutoryRegistration.count({ where: { organizationId: org, statute: { in: ['IN.PF', 'IN.ESI'] }, status: { in: ['on', 'applied_awaited'] } } });
  return n ? '13' : '0';
}
export async function statutoryCostPct(tx: Tx, org: string) {
  const row = await tx.setting.findFirst({ where: { organizationId: org, key: 'staffing.statutory_cost_pct', scopeType: 'tenant', scopeId: org }, select: { value: true } });
  return Number(row?.value ?? (await statutoryCostDefault(tx, org)));
}


@Injectable()
export class StaffingService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly settings: OrgSettingsService,
  ) {}

  async access(user: ScopeUser): Promise<Access> {
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, [...KEYS]);
    const manage = tenantWide(v, 'ats.staffing.manage');
    const settings = manage || tenantWide(v, 'org.settings.manage');
    // Vendor quotes and caps are costs: account managers and vendor managers see them, recruiters never do.
    // Slice 3: finance (invoices, receipts, vendor invoices) is its own key.
    return { manage, view: manage || tenantWide(v, 'ats.staffing.view'), settings, vendorRates: settings || tenantWide(v, 'ats.agency.manage'), billing: tenantWide(v, 'ats.staffing.billing'), actingForOther: v.actingForOther };
  }

    /** Whether the company turned the desk on (the menu asks; anyone signed in may know). */
  desk(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => ({ enabled: (await settingFor(tx, c, 'staffing.desk.enabled', { legalEntityId: '' })) === 'on' }));
  }

  async gate(user: ScopeUser, need: 'view' | 'manage') {
    const a = await this.access(user);
    if (need === 'manage' && a.actingForOther) throw new ForbiddenException('Not available while acting for someone else. Sign in as yourself.');
    if (!(need === 'manage' ? a.manage : a.view)) throw new ForbiddenException(need === 'manage' ? 'Only account managers (the staffing desk key for the whole company) can change this.' : 'You need the staffing desk key to see clients.');
    return a;
  }

  async deskOn(tx: Tx, c: CompanyContext) {
    if ((await settingFor(tx, c, 'staffing.desk.enabled', { legalEntityId: '' })) !== 'on') throw new ForbiddenException('The staffing desk is off for your company. An admin turns it on in Settings › Staffing desk.');
  }

  async client(tx: Tx, c: CompanyContext, id: string) {
    const row = await tx.staffingClient.findFirst({ where: { id, organizationId: c.organizationId } });
    if (!row) throw new NotFoundException('Client not found.');
    return row;
  }

  /** GSTIN shape, check character, and its state code (data: rule set GST.STATE_CODES) matching the billing state. */
  private async checkGstin(tx: Tx, gstin: string | null | undefined, state: string) {
    if (!gstin) return null;
    const g = gstin.trim().toUpperCase();
    const bad = gstinProblem(g);
    if (bad) throw new BadRequestException(bad);
    const set = await tx.statutoryRuleSet.findFirst({ where: { statute: 'GST.STATE_CODES', jurisdiction: 'IN', status: 'published' }, orderBy: { validFrom: 'desc' }, select: { values: true } });
    const codes = (set?.values ?? {}) as Record<string, string>;
    if (codes[g.slice(0, 2)] && codes[g.slice(0, 2)] !== state) throw new BadRequestException(`The GSTIN is registered in ${IN_STATES[codes[g.slice(0, 2)]!] ?? g.slice(0, 2)}, but the billing state is ${IN_STATES[state] ?? state}. Check both.`);
    return g;
  }

  private async manager(tx: Tx, c: CompanyContext, userId: string | null | undefined) {
    if (!userId) return null;
    if (!(await tx.user.findFirst({ where: { organizationId: c.organizationId, id: userId, status: 'active' }, select: { id: true } }))) throw new BadRequestException('The account manager must be an active person of your company.');
    return userId;
  }

  /* ---------------- HIR-14 clients ---------------- */

  async listClients(ctx: TenantContext, user: ScopeUser) {
    const a = await this.gate(user, 'view');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.deskOn(tx, c);
      const rows = await tx.staffingClient.findMany({ where: { organizationId: c.organizationId }, orderBy: { name: 'asc' }, take: 2000, include: { _count: { select: { contacts: { where: { archivedAt: null } } } } } });
      const names = await this.userNames(tx, c, rows.map((r) => r.accountManagerUserId));
      return { canManage: a.manage && !a.actingForOther, choices: a.manage ? await this.choices(tx, c) : null, rows: rows.map((r) => ({ id: r.id, name: r.name, gstin: r.gstin, state: r.state, stateName: IN_STATES[r.state] ?? r.state, status: r.status, accountManager: r.accountManagerUserId ? (names.get(r.accountManagerUserId) ?? '') : '', contractEnd: iso(r.contractEnd), contacts: r._count.contacts })) };
    });
  }

  async getClient(ctx: TenantContext, user: ScopeUser, id: string) {
    const a = await this.gate(user, 'view');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.deskOn(tx, c);
      const r = await this.client(tx, c, id);
      const contacts = await tx.staffingClientContact.findMany({ where: { organizationId: c.organizationId, clientId: id, archivedAt: null }, orderBy: { name: 'asc' } });
      const names = await this.userNames(tx, c, [r.accountManagerUserId]);
      const terms = Number(await settingFor(tx, c, 'staffing.payment_terms_days', { legalEntityId: '' }));
      return {
        canManage: a.manage && !a.actingForOther,
        choices: a.manage ? await this.choices(tx, c) : null,
        client: { ...this.clientView(r), accountManager: r.accountManagerUserId ? (names.get(r.accountManagerUserId) ?? '') : '', defaultPaymentTermsDays: terms },
        contacts: contacts.map((x) => ({ id: x.id, name: x.name, role: x.role, email: x.email, phone: x.phone, billing: x.billing, portal: x.portal })),
      };
    });
  }

  async createClient(ctx: TenantContext, user: ScopeUser, dto: ClientDto) {
    await this.gate(user, 'manage');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.deskOn(tx, c);
      const data = await this.clientData(tx, c, dto);
      const row = await tx.staffingClient.create({ data: { organizationId: c.organizationId, ...data, createdBy: c.userId ?? null } }).catch(dup);
      await audit(tx, c, 'staffing.client.created', 'staffing_client', row.id, { name: row.name, gstin: row.gstin, state: row.state });
      return { id: row.id };
    });
  }

  async updateClient(ctx: TenantContext, user: ScopeUser, id: string, dto: ClientDto & { version: number }) {
    await this.gate(user, 'manage');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.deskOn(tx, c);
      const before = await this.client(tx, c, id);
      const data = await this.clientData(tx, c, dto);
      const { count } = await tx.staffingClient.updateMany({ where: { id, organizationId: c.organizationId, version: dto.version }, data: { ...data, version: { increment: 1 } } }).catch(dup);
      if (!count) throw new ConflictException('Someone changed this client meanwhile. Reload it and try again.');
      const after = await this.client(tx, c, id);
      await audit(tx, c, 'staffing.client.updated', 'staffing_client', id, { changed: changes(this.clientView(before), this.clientView(after)) });
      return { id, version: after.version };
    });
  }

  private async clientData(tx: Tx, c: CompanyContext, dto: ClientDto) {
    if (!IN_STATES[dto.state]) throw new BadRequestException('Choose the billing state from the list.');
    if (dto.contractStart && dto.contractEnd && dto.contractEnd < dto.contractStart) throw new BadRequestException('The contract cannot end before it starts.');
    return {
      name: dto.name,
      legalName: dto.legalName || null,
      gstin: await this.checkGstin(tx, dto.gstin, dto.state),
      state: dto.state,
      billingAddress: dto.billingAddress,
      status: dto.status ?? 'onboarding',
      accountManagerUserId: await this.manager(tx, c, dto.accountManagerUserId),
      paymentTermsDays: dto.paymentTermsDays ?? null,
      contractStart: day(dto.contractStart),
      contractEnd: day(dto.contractEnd),
      noticeDays: dto.noticeDays ?? null,
      slaFirstSubmissionDays: dto.slaFirstSubmissionDays ?? null,
      slaFeedbackDays: dto.slaFeedbackDays ?? null,
      // Slice 3 (answer 454): the client's TDS section and invoice grouping (an existing value is kept when not sent).
      ...(dto.tdsSection !== undefined ? { tdsSection: dto.tdsSection } : {}),
      ...(dto.invoiceGrouping ? { invoiceGrouping: dto.invoiceGrouping } : {}),
    };
  }

  private clientView(r: Prisma.StaffingClientGetPayload<object>) {
    return {
      id: r.id,
      name: r.name,
      legalName: r.legalName,
      gstin: r.gstin,
      state: r.state,
      stateName: IN_STATES[r.state] ?? r.state,
      billingAddress: r.billingAddress,
      status: r.status,
      accountManagerUserId: r.accountManagerUserId,
      paymentTermsDays: r.paymentTermsDays,
      contractStart: iso(r.contractStart),
      contractEnd: iso(r.contractEnd),
      noticeDays: r.noticeDays,
      slaFirstSubmissionDays: r.slaFirstSubmissionDays,
      slaFeedbackDays: r.slaFeedbackDays,
      tdsSection: r.tdsSection,
      invoiceGrouping: r.invoiceGrouping,
      version: r.version,
    };
  }

  /* ---------------- contacts ---------------- */

  async saveContact(ctx: TenantContext, user: ScopeUser, clientId: string, contactId: string | null, dto: ClientContactDto) {
    await this.gate(user, 'manage');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.deskOn(tx, c);
      await this.client(tx, c, clientId);
      const data = { name: dto.name, role: dto.role, email: dto.email.toLowerCase(), phone: dto.phone || null, billing: dto.billing ?? false };
      let id = contactId;
      if (contactId) {
        const { count } = await tx.staffingClientContact.updateMany({ where: { id: contactId, clientId, organizationId: c.organizationId, archivedAt: null }, data }).catch(dup);
        if (!count) throw new NotFoundException('Contact not found.');
      } else id = (await tx.staffingClientContact.create({ data: { organizationId: c.organizationId, clientId, ...data } }).catch(dup)).id;
      await audit(tx, c, contactId ? 'staffing.contact.updated' : 'staffing.contact.added', 'staffing_client', clientId, { contactId: id, billing: data.billing });
      return { id };
    });
  }

  async archiveContact(ctx: TenantContext, user: ScopeUser, clientId: string, contactId: string) {
    await this.gate(user, 'manage');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.deskOn(tx, c);
      const { count } = await tx.staffingClientContact.updateMany({ where: { id: contactId, clientId, organizationId: c.organizationId, archivedAt: null }, data: { archivedAt: new Date() } });
      if (!count) throw new NotFoundException('Contact not found.');
      await audit(tx, c, 'staffing.contact.removed', 'staffing_client', clientId, { contactId });
      return { removed: true };
    });
  }

  /* ---------------- HIR-15 rate cards ---------------- */

  /** A client's rate card: current lines, or every dated version; pay rates and margins only for account managers. */
  async rates(ctx: TenantContext, user: ScopeUser, clientId: string, history: boolean) {
    const a = await this.gate(user, 'view');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.deskOn(tx, c);
      const client = await this.client(tx, c, clientId);
      const rows = await tx.staffingRate.findMany({ where: { organizationId: c.organizationId, clientId, ...(history ? {} : { validTo: null }) }, orderBy: [{ role: 'asc' }, { validFrom: 'desc' }] });
      const pay = a.manage;
      return {
        client: { id: client.id, name: client.name },
        canManage: a.manage && !a.actingForOther,
        showPay: pay,
        defaults: { ot: await settingFor(tx, c, 'staffing.ot_multiplier', { legalEntityId: '' }), holiday: await settingFor(tx, c, 'staffing.holiday_multiplier', { legalEntityId: '' }), backdateDays: Number(await settingFor(tx, c, 'staffing.rate_change.backdate_days', { legalEntityId: '' })), today: todayIst() },
        rows: rows.map((r) => ({
          id: r.id,
          lineId: r.lineId,
          role: r.role,
          skill: r.skill,
          location: r.location,
          unit: r.unit,
          billRate: toRupees(r.billRatePaise),
          ...(pay ? { payRate: toRupees(r.payRatePaise), marginPct: marginPct(r.billRatePaise, r.payRatePaise) } : {}),
          ot: r.otMultiplier.toString(),
          holiday: r.holidayMultiplier.toString(),
          validFrom: iso(r.validFrom)!,
          validTo: iso(r.validTo),
        })),
      };
    });
  }

  async addRateLine(ctx: TenantContext, user: ScopeUser, clientId: string, dto: RateLineDto) {
    await this.gate(user, 'manage');
    const { bill, pay } = money(dto.billRate, dto.payRate);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.deskOn(tx, c);
      await this.client(tx, c, clientId);
      const back = Number(await settingFor(tx, c, 'staffing.rate_change.backdate_days', { legalEntityId: '' }));
      const today = todayIst();
      if (dto.validFrom < dayAdd(today, -back)) throw new BadRequestException(back ? `A rate can start at most ${back} days back.` : 'A rate starts today or later.');
      const same = await tx.staffingRate.findFirst({ where: { organizationId: c.organizationId, clientId, validTo: null, role: { equals: dto.role, mode: 'insensitive' }, skill: { equals: dto.skill, mode: 'insensitive' }, location: { equals: dto.location, mode: 'insensitive' }, unit: dto.unit } });
      if (same) throw new ConflictException('This role, skill and location is already on the card. Change its rate instead.');
      const row = await tx.staffingRate.create({
        data: {
          organizationId: c.organizationId,
          clientId,
          lineId: randomUUID(),
          role: dto.role,
          skill: dto.skill,
          location: dto.location,
          unit: dto.unit,
          billRatePaise: bill,
          payRatePaise: pay,
          otMultiplier: new Prisma.Decimal(dto.ot ?? (await settingFor(tx, c, 'staffing.ot_multiplier', { legalEntityId: '' }))),
          holidayMultiplier: new Prisma.Decimal(dto.holiday ?? (await settingFor(tx, c, 'staffing.holiday_multiplier', { legalEntityId: '' }))),
          validFrom: day(dto.validFrom)!,
          reason: dto.reason || null,
          createdBy: c.userId ?? null,
        },
      });
      await audit(tx, c, 'staffing.rate.added', 'staffing_client', clientId, { lineId: row.lineId, role: row.role, bill: toRupees(bill), pay: toRupees(pay), validFrom: dto.validFrom });
      return { id: row.id };
    });
  }

  /** A dated change: the current version ends the day before; the old rate stays for the days it covered. */
  async changeRate(ctx: TenantContext, user: ScopeUser, rateId: string, dto: RateChangeDto) {
    await this.gate(user, 'manage');
    const { bill, pay } = money(dto.billRate, dto.payRate);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.deskOn(tx, c);
      const cur = await tx.staffingRate.findFirst({ where: { id: rateId, organizationId: c.organizationId } });
      if (!cur) throw new NotFoundException('Rate not found.');
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`staffing_rate:${cur.lineId}`}))`;
      if (cur.validTo) throw new ConflictException('This rate has already been replaced. Reload the rate card.');
      const back = Number(await settingFor(tx, c, 'staffing.rate_change.backdate_days', { legalEntityId: '' }));
      const bad = rateChangeProblem(iso(cur.validFrom)!, dto.validFrom, todayIst(), back);
      if (bad) throw new BadRequestException(bad);
      const { count } = await tx.staffingRate.updateMany({ where: { id: cur.id, validTo: null }, data: { validTo: day(dayBefore(dto.validFrom))! } });
      if (!count) throw new ConflictException('This rate has already been replaced. Reload the rate card.');
      const row = await tx.staffingRate.create({
        data: { organizationId: c.organizationId, clientId: cur.clientId, lineId: cur.lineId, role: cur.role, skill: cur.skill, location: cur.location, unit: cur.unit, billRatePaise: bill, payRatePaise: pay, otMultiplier: dto.ot ? new Prisma.Decimal(dto.ot) : cur.otMultiplier, holidayMultiplier: dto.holiday ? new Prisma.Decimal(dto.holiday) : cur.holidayMultiplier, validFrom: day(dto.validFrom)!, reason: dto.reason, createdBy: c.userId ?? null },
      });
      await audit(tx, c, 'staffing.rate.changed', 'staffing_client', cur.clientId, { lineId: cur.lineId, role: cur.role, from: { bill: toRupees(cur.billRatePaise), pay: toRupees(cur.payRatePaise) }, to: { bill: toRupees(bill), pay: toRupees(pay) }, validFrom: dto.validFrom, reason: dto.reason });
      return { id: row.id };
    });
  }

  /* ---------------- Settings 6.2 ---------------- */

  async readSettings(ctx: TenantContext, user: ScopeUser) {
    const a = await this.access(user);
    if (!a.settings && !a.view) throw new ForbiddenException('You need the staffing desk key or the settings key to see the staffing desk settings.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const rows = await tx.setting.findMany({ where: { organizationId: org, key: { in: [...STAFFING_SETTING_KEYS] }, scopeType: 'tenant', scopeId: org } });
      const statDefault = await statutoryCostDefault(tx, org);
      const dflt = (k: string) => (k === 'staffing.statutory_cost_pct' ? statDefault : SETTINGS[k]!.default);
      const values = Object.fromEntries(STAFFING_SETTING_KEYS.map((k) => [k, String(rows.find((r) => r.key === k)?.value ?? dflt(k))]));
      const last = rows.filter((r) => r.updatedBy).sort((x, y) => y.updatedAt.getTime() - x.updatedAt.getTime())[0];
      const by = last ? await tx.user.findFirst({ where: { organizationId: org, id: last.updatedBy! }, select: { name: true, email: true } }) : null;
      const entities = await tx.legalEntity.findMany({ where: { organizationId: org, archivedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true, gstin: true } });
      const regs = await tx.entityGstRegistration.findMany({ where: { organizationId: org, validTo: null }, select: { legalEntityId: true, gstin: true } });
      const series = await tx.staffingInvoiceSeries.findMany({ where: { organizationId: org }, orderBy: [{ financialYear: 'desc' }, { gstin: 'asc' }] });
      const teams = await this.portalTeams(tx, org);
      return {
        canEdit: a.settings && !a.actingForOther,
        values,
        defaults: Object.fromEntries(STAFFING_SETTING_KEYS.map((k) => [k, dflt(k)])),
        choices: { ...Object.fromEntries(STAFFING_SETTING_KEYS.map((k) => [k, SETTINGS[k]!.values])), 'staffing.portal.tickets_team': ['account_manager', ...teams.map((t) => t.id)] },
        // Answer 491: the Helpdesk teams client portal tickets can go to (labels for the choices above).
        teams: teams.map((t) => ({ value: t.id, label: t.label })),
        lastChange: last ? { by: by?.name || by?.email || 'Someone', at: last.updatedAt, what: `Changed ${SETTINGS[last.key]!.label.replace(/^Staffing desk: /, '').toLowerCase()}` } : null,
        financialYear: financialYear(todayIst()),
        entities: entities.map((e) => ({ id: e.id, name: e.name, gstins: [...new Set([e.gstin, ...regs.filter((r) => r.legalEntityId === e.id).map((r) => r.gstin)].filter((g): g is string => Boolean(g)))] })),
        series: series.map((s) => ({ id: s.id, legalEntityId: s.legalEntityId, entity: entities.find((e) => e.id === s.legalEntityId)?.name ?? 'Archived entity', gstin: s.gstin, financialYear: s.financialYear, prefix: s.prefix, nextNumber: s.nextNumber, version: s.version })),
      };
    });
  }

  /** Several settings at once: every key and value checked first; each a company setting, audited with before and after. */
  async saveSettings(ctx: TenantContext, user: ScopeUser, changes: { key: string; value: string }[]) {
    const a = await this.access(user);
    if (a.actingForOther) throw new ForbiddenException('Not available while acting for someone else. Sign in as yourself.');
    if (!a.settings) throw new ForbiddenException('Only account managers or HR with the settings key for the whole company can change these settings.');
    const seen = new Set<string>();
    for (const ch of changes) {
      if (!(STAFFING_SETTING_KEYS as readonly string[]).includes(ch.key)) throw new BadRequestException(`${ch.key} is not a staffing desk setting.`);
      if (seen.has(ch.key)) throw new BadRequestException(`${SETTINGS[ch.key]!.label} is in the list twice.`);
      seen.add(ch.key);
      const def = SETTINGS[ch.key]!;
      // A text setting (answer 522 ledger names): non-empty, short, no line breaks.
      if (ch.key === 'staffing.portal.tickets_team') continue; // checked against the company's teams below
      if (def.text) {
        if (!ch.value.trim() || ch.value.length > def.text.maxLength || /[\r\n<>]/.test(ch.value)) throw new BadRequestException(`${def.label}: up to ${def.text.maxLength} characters, on one line.`);
      } else if (!def.values.includes(ch.value)) throw new BadRequestException(`${def.label} is one of: ${def.values.join(', ')}`);
    }
    const team = changes.find((ch) => ch.key === 'staffing.portal.tickets_team');
    if (team && team.value !== 'account_manager') {
      const ok = await inCompany(this.tenantPrisma, ctx, async (tx, c) => (await this.portalTeams(tx, c.organizationId)).some((t) => t.id === team.value));
      if (!ok) throw new BadRequestException('Choose the account manager or an active Helpdesk team.');
    }
    for (const ch of changes) await this.settings.set(ctx, { key: ch.key, scopeType: 'tenant', value: ch.value } as Parameters<OrgSettingsService['set']>[1]);
    return this.readSettings(ctx, user);
  }

  /** Answer 491: the company's active Helpdesk teams on active desks (read as the desk system: only names and ids). */
  async portalTeams(tx: Tx, org: string) {
    await tx.$executeRaw`SELECT set_config('app.sd_system', 'on', true)`;
    const groups = await tx.sdGroup.findMany({ where: { organizationId: org, active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, deskId: true } });
    const desks = new Map((await tx.sdDesk.findMany({ where: { organizationId: org, status: 'active', id: { in: groups.map((g) => g.deskId) } }, select: { id: true, name: true } })).map((d) => [d.id, d.name]));
    return groups.filter((g) => desks.has(g.deskId)).map((g) => ({ id: g.id, deskId: g.deskId, label: `${desks.get(g.deskId)} · ${g.name}` }));
  }

  /**
   * An invoice series (CGST Rules 2017 r.46(b): one consecutive series per GSTIN per financial year): the GSTIN must be
   * one of the legal entity's own; the next number may only go up (numbers already used are never given again).
   */
  async saveSeries(ctx: TenantContext, user: ScopeUser, id: string | null, dto: InvoiceSeriesDto) {
    const a = await this.access(user);
    if (a.actingForOther) throw new ForbiddenException('Not available while acting for someone else. Sign in as yourself.');
    if (!a.settings) throw new ForbiddenException('Only account managers or HR with the settings key for the whole company can change invoice numbering.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      if ((Number(dto.financialYear.slice(0, 4)) + 1) % 100 !== Number(dto.financialYear.slice(5))) throw new BadRequestException('Give the financial year as 2026-27.');
      if (dto.prefix.length + String(dto.nextNumber).length > 16) throw new BadRequestException('A GST invoice number has at most 16 characters: shorten the prefix.');
      const g = dto.gstin.trim().toUpperCase();
      const bad = gstinProblem(g);
      if (bad) throw new BadRequestException(bad);
      const entity = await tx.legalEntity.findFirst({ where: { id: dto.legalEntityId, organizationId: org, archivedAt: null }, select: { id: true, gstin: true } });
      if (!entity) throw new NotFoundException('Legal entity not found.');
      const own = entity.gstin === g || (await tx.entityGstRegistration.count({ where: { organizationId: org, legalEntityId: entity.id, gstin: g } })) > 0;
      if (!own) throw new BadRequestException('That GSTIN is not one of this legal entity’s registrations (Settings › Legal entities).');
      if (id) {
        const cur = await tx.staffingInvoiceSeries.findFirst({ where: { id, organizationId: org } });
        if (!cur) throw new NotFoundException('Invoice series not found.');
        if (dto.nextNumber < cur.nextNumber) throw new BadRequestException(`The next number cannot go back (it is ${cur.nextNumber}); numbers already used are never given again.`);
        const { count } = await tx.staffingInvoiceSeries.updateMany({ where: { id, organizationId: org, version: dto.version ?? cur.version }, data: { legalEntityId: entity.id, gstin: g, financialYear: dto.financialYear, prefix: dto.prefix, nextNumber: dto.nextNumber, version: { increment: 1 } } }).catch(dup);
        if (!count) throw new ConflictException('Someone changed this series meanwhile. Reload and try again.');
        await audit(tx, c, 'staffing.invoice_series.updated', 'staffing_invoice_series', id, { from: { prefix: cur.prefix, next: cur.nextNumber, gstin: cur.gstin, fy: cur.financialYear }, to: { prefix: dto.prefix, next: dto.nextNumber, gstin: g, fy: dto.financialYear } });
        return { id };
      }
      const row = await tx.staffingInvoiceSeries.create({ data: { organizationId: org, legalEntityId: entity.id, gstin: g, financialYear: dto.financialYear, prefix: dto.prefix, nextNumber: dto.nextNumber, createdBy: c.userId ?? null } }).catch(dup);
      await audit(tx, c, 'staffing.invoice_series.created', 'staffing_invoice_series', row.id, { gstin: g, fy: dto.financialYear, prefix: dto.prefix, next: dto.nextNumber });
      return { id: row.id };
    });
  }

  /** What the client sheet offers: the billing states and the people who can be account manager. */
  private async choices(tx: Tx, c: CompanyContext) {
    const people = await tx.user.findMany({ where: { organizationId: c.organizationId, status: 'active' }, orderBy: [{ name: 'asc' }, { email: 'asc' }], take: 1000, select: { id: true, name: true, email: true } });
    return { states: Object.entries(IN_STATES).map(([value, label]) => ({ value, label })), people: people.map((u) => ({ value: u.id, label: u.name || u.email })) };
  }

  private async userNames(tx: Tx, c: CompanyContext, ids: (string | null)[]) {
    const want = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    return new Map((await tx.user.findMany({ where: { organizationId: c.organizationId, id: { in: want } }, select: { id: true, name: true, email: true } })).map((u) => [u.id, u.name || u.email]));
  }
}

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const day = (s: string | null | undefined) => (s ? new Date(`${s}T00:00:00Z`) : null);
const dayAdd = (s: string, n: number) => new Date(Date.parse(`${s}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Rupee amounts as exact paise; the pay rate never above the bill rate (no line at a loss). */
function money(billRate: string, payRate: string) {
  const bill = toPaise(billRate);
  const pay = toPaise(payRate);
  if (bill == null || bill <= 0n) throw new BadRequestException('Enter the bill rate in rupees, up to 2 decimals.');
  if (pay == null || pay <= 0n) throw new BadRequestException('Enter the pay rate in rupees, up to 2 decimals.');
  if (pay > bill) throw new BadRequestException('The pay rate is above the bill rate: the line would run at a loss. Check both.');
  return { bill, pay };
}

/** A unique index hit becomes a plain 409. */
function dup(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    const target = String((e.meta as { target?: unknown } | undefined)?.target ?? '');
    throw new ConflictException(/gstin/.test(target) ? 'A client with this GSTIN already exists.' : /email/.test(target) ? 'This client already has a contact with this email.' : /name/.test(target) ? 'A client with this name already exists.' : 'That already exists.');
  }
  throw e;
}

/** Field-by-field before and after, for the audit log. */
function changes(a: Record<string, unknown>, b: Record<string, unknown>) {
  return Object.fromEntries(Object.keys(b).filter((k) => k !== 'version' && JSON.stringify(a[k]) !== JSON.stringify(b[k])).map((k) => [k, { from: a[k], to: b[k] }]));
}
