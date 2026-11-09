import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import type { ScopeUser } from '../access/scope';
import { audit, CompanyContext, inCompany, Tx } from '../org-structure/org-structure.service';
import { IN_STATES, todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { StaffingService } from './staffing.service';
import { rateOn } from './staffing-work.service';
import { financialYear, toPaise, toRupees } from './staffing-rules';
import { addDays, ageingBucket, creditProblem, daysBetween, eInvoiceState, gstSplit, lineAmount, mondayOf, nextReminder, pctToBp, splitTds, taperProblem } from './billing-rules';
import type { ApproveHoursDto, ClientTermsDto, CollectionDto, CreditNoteDto, DraftInvoiceDto, HoursDto, ReceiptDto, ReissueDto, VendorBillDto, VendorBillPaidDto, VersionDto } from './staffing-dto';

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const centi = (s: string) => {
  const p = toPaise(s); // the same exact-decimal parser: "40.5" → 4050
  return p == null ? null : Number(p);
};
const qty = (c: number) => (c / 100).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
type Need = 'manage' | 'billing' | 'read';
type Access = Awaited<ReturnType<StaffingService['access']>>;

/** A rule set's values (latest published, India). */
export async function ruleValues<T>(tx: Tx, statute: string): Promise<T> {
  const r = await tx.statutoryRuleSet.findFirst({ where: { statute, jurisdiction: 'IN', status: 'published' }, orderBy: { validFrom: 'desc' }, select: { values: true } });
  if (!r) throw new BadRequestException(`The rule set ${statute} is missing. Ask your admin.`);
  return r.values as T;
}

/**
 * Staffing slice 3: weekly hours the client approves (T9-06 or recorded by the account manager), tax invoices and credit
 * notes from approved hours (HIR-18) numbered from the slice-1 series, receipts with client TDS and the receivables
 * ledger (HIR-19), the e-invoice window (HIR-31, rule data; no IRP connection), per-client fees and guarantee (HIR-30)
 * and vendor invoices from vendor workers' approved hours (answer 490). Finance (`ats.staffing.billing`) creates and
 * issues; account managers read invoices and keep hours and fees; recruiters see none of it.
 */
@Injectable()
export class StaffingBillingService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly staffing: StaffingService,
  ) {}

  /** The key (manage: account manager; billing: finance; read: either), the desk on, then the company's transaction. */
  private async run<T>(ctx: TenantContext, user: ScopeUser, need: Need, fn: (tx: Tx, c: CompanyContext, a: Access) => Promise<T>, write = false): Promise<T> {
    const a = await this.staffing.access(user);
    const ok = need === 'manage' ? a.manage : need === 'billing' ? a.billing : a.manage || a.billing;
    if (!ok) throw new ForbiddenException(need === 'manage' ? 'Only account managers can do this.' : need === 'billing' ? 'Only staffing finance can do this.' : 'You need the staffing finance or account manager key.');
    if (write && a.actingForOther) throw new ForbiddenException('Not available while acting for someone else. Sign in as yourself.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.staffing.deskOn(tx, c);
      return fn(tx, c, a);
    });
  }

  private async placement(tx: Tx, c: CompanyContext, id: string) {
    const p = await tx.staffingPlacement.findFirst({ where: { id, organizationId: c.organizationId } });
    if (!p) throw new NotFoundException('Placement not found.');
    return p;
  }

  /* ---------------- hours ---------------- */

  private hoursView(h: Prisma.StaffingHoursGetPayload<object>) {
    return { id: h.id, placementId: h.placementId, weekStart: iso(h.weekStart), hours: qty(h.hoursCenti), overtime: qty(h.overtimeCenti), status: h.status, note: h.note, decidedAt: h.decidedAt, invoiced: Boolean(h.invoiceId), version: h.version };
  }

  hours(ctx: TenantContext, user: ScopeUser, placementId: string) {
    return this.run(ctx, user, 'read', async (tx, c, a) => {
      const p = await this.placement(tx, c, placementId);
      const rows = await tx.staffingHours.findMany({ where: { organizationId: c.organizationId, placementId: p.id }, orderBy: { weekStart: 'desc' }, take: 200 });
      const contacts = await tx.staffingClientContact.findMany({ where: { organizationId: c.organizationId, clientId: p.clientId, archivedAt: null }, select: { id: true, name: true, role: true } });
      return { canEnter: a.manage && !a.actingForOther && p.status === 'active', contacts, rows: rows.map((h) => this.hoursView(h)) };
    });
  }

  /** A week's hours (Monday start, within the placement); a week sent back may be entered again, an approved one not. */
  async saveHours(ctx: TenantContext, user: ScopeUser, placementId: string, dto: HoursDto) {
    const h = centi(dto.hours);
    const o = dto.overtime ? centi(dto.overtime) : 0;
    if (h == null || o == null || h + o <= 0 || h > 16800 || o > 16800) throw new BadRequestException('Enter the hours for the week, up to 2 decimals.');
    if (mondayOf(dto.weekStart) !== dto.weekStart) throw new BadRequestException('A week starts on a Monday.');
    return this.run(ctx, user, 'manage', async (tx, c) => {
      const p = await this.placement(tx, c, placementId);
      if (p.status !== 'active') throw new ConflictException('This placement has ended.');
      if (addDays(dto.weekStart, 6) < iso(p.startOn)! || dto.weekStart > iso(p.endOn)!) throw new BadRequestException('That week is outside the placement.');
      if (dto.weekStart > todayIst()) throw new BadRequestException('Hours are entered once the week has started.');
      const cur = await tx.staffingHours.findFirst({ where: { organizationId: c.organizationId, placementId, weekStart: day(dto.weekStart) } });
      if (cur?.status === 'approved') throw new ConflictException('The client approved this week already.');
      const data = { hoursCenti: h, overtimeCenti: o, status: 'waiting', note: null, decidedAt: null, decidedByContactId: null, decidedByUserId: null };
      const row = cur
        ? await tx.staffingHours.update({ where: { id: cur.id }, data: { ...data, version: { increment: 1 } } })
        : await tx.staffingHours.create({ data: { organizationId: c.organizationId, placementId, clientId: p.clientId, weekStart: day(dto.weekStart), enteredBy: c.userId ?? null, ...data } });
      await audit(tx, c, 'staffing.hours.entered', 'staffing_placement', placementId, { weekStart: dto.weekStart, hours: dto.hours, overtime: dto.overtime ?? '0' });
      return { id: row.id };
    });
  }

  /** The client's approval recorded by the account manager (a client without the portal), naming the contact. */
  async approveHours(ctx: TenantContext, user: ScopeUser, id: string, dto: ApproveHoursDto) {
    return this.run(ctx, user, 'manage', async (tx, c) => {
      const h = await tx.staffingHours.findFirst({ where: { id, organizationId: c.organizationId } });
      if (!h) throw new NotFoundException('Hours not found.');
      const contact = await tx.staffingClientContact.findFirst({ where: { id: dto.contactId, organizationId: c.organizationId, clientId: h.clientId, archivedAt: null } });
      if (!contact) throw new BadRequestException('Choose the client contact who approved.');
      const { count } = await tx.staffingHours.updateMany({ where: { id, version: dto.version, status: 'waiting' }, data: { status: 'approved', decidedByContactId: contact.id, decidedByUserId: c.userId ?? null, decidedAt: new Date(), version: { increment: 1 } } });
      if (!count) throw new ConflictException('These hours changed meanwhile, or are not waiting for the client.');
      await audit(tx, c, 'staffing.hours.approved', 'staffing_hours', id, { by: 'account_manager', contactId: contact.id });
      return { id };
    }, true);
  }

  /* ---------------- invoices ---------------- */

  private async supplierState(tx: Tx, gstin: string) {
    const codes = await ruleValues<Record<string, string>>(tx, 'GST.STATE_CODES');
    const s = codes[gstin.slice(0, 2)];
    if (!s) throw new BadRequestException('The series GSTIN has no known state code.');
    return s;
  }

  /** Taxes for a taxable value at the invoice's rate and supply (stored on the invoice). */
  private taxes(taxable: bigint, gstPct: string, supplierState: string, placeOfSupply: string) {
    return gstSplit(taxable, pctToBp(gstPct)!, supplierState !== placeOfSupply);
  }

  private async dueDays(tx: Tx, c: CompanyContext, clientId: string) {
    const cl = await tx.staffingClient.findFirst({ where: { id: clientId, organizationId: c.organizationId }, select: { paymentTermsDays: true } });
    return cl?.paymentTermsDays ?? Number(await settingFor(tx, c, 'staffing.payment_terms_days', { legalEntityId: '' }));
  }

  /** The Create invoices sheet: approved hours not yet invoiced, by client and month; the series to number from. */
  options(ctx: TenantContext, user: ScopeUser) {
    return this.run(ctx, user, 'billing', async (tx, c) => {
      const open = await tx.staffingHours.groupBy({ by: ['clientId', 'weekStart'], where: { organizationId: c.organizationId, status: 'approved', invoiceId: null }, _count: { _all: true } });
      const clients = await tx.staffingClient.findMany({ where: { organizationId: c.organizationId, id: { in: [...new Set(open.map((o) => o.clientId))] } }, select: { id: true, name: true } });
      const series = await tx.staffingInvoiceSeries.findMany({ where: { organizationId: c.organizationId }, orderBy: [{ financialYear: 'desc' }, { prefix: 'asc' }] });
      return {
        clients: clients.map((cl) => ({ id: cl.id, name: cl.name, months: [...new Set(open.filter((o) => o.clientId === cl.id).map((o) => iso(o.weekStart)!.slice(0, 7)))].sort() })),
        series: series.map((s) => ({ id: s.id, label: `${s.prefix} · ${s.gstin} · ${s.financialYear}`, financialYear: s.financialYear })),
      };
    });
  }

  /**
   * Drafts from a client's approved, not yet invoiced hours of one month (a week counts in the month of its Monday).
   * Grouping (answer 454): one invoice for the month with lines by placement, or one invoice per placement. Each line is
   * hours × the rate-card bill rate on that week (overtime at the line's OT multiplier).
   */
  async draft(ctx: TenantContext, user: ScopeUser, dto: DraftInvoiceDto) {
    return this.run(ctx, user, 'billing', async (tx, c) => {
      const org = c.organizationId;
      const client = await this.staffing.client(tx, c, dto.clientId);
      const series = await tx.staffingInvoiceSeries.findFirst({ where: { id: dto.seriesId, organizationId: org } });
      if (!series) throw new BadRequestException('Choose an invoice series.');
      const from = `${dto.month}-01`;
      const to = addDays(`${new Date(Date.UTC(Number(dto.month.slice(0, 4)), Number(dto.month.slice(5, 7)), 1)).toISOString().slice(0, 10)}`, -1);
      const hours = await tx.staffingHours.findMany({ where: { organizationId: org, clientId: client.id, status: 'approved', invoiceId: null, weekStart: { gte: day(from), lte: day(to) } }, orderBy: [{ placementId: 'asc' }, { weekStart: 'asc' }] });
      if (!hours.length) throw new BadRequestException('No approved hours to invoice for this client and month.');
      const placements = await tx.staffingPlacement.findMany({ where: { organizationId: org, id: { in: [...new Set(hours.map((h) => h.placementId))] } } });
      const gst = await ruleValues<{ gstPct: string }>(tx, 'GST.STAFFING_RATE');
      const supplierState = await this.supplierState(tx, series.gstin);
      // Lines per placement and rate (a dated rate change mid-month gives two lines).
      const groups = new Map<string, { placementId: string; desc: string; qty: number; rate: bigint; hours: string[] }>();
      for (const h of hours) {
        const p = placements.find((x) => x.id === h.placementId)!;
        const r = await rateOn(tx, org, p.lineId, iso(h.weekStart)! < iso(p.startOn)! ? iso(p.startOn)! : iso(h.weekStart)!);
        if (!r) throw new BadRequestException(`The rate card has no rate for ${p.workerName} in the week of ${iso(h.weekStart)}.`);
        const add = (kind: string, q: number, rate: bigint) => {
          if (!q) return;
          const k = `${p.id}|${kind}|${rate}`;
          const g = groups.get(k) ?? { placementId: p.id, desc: `${p.workerName} · ${r.role}${kind === 'ot' ? ' · overtime' : ''}`, qty: 0, rate, hours: [] };
          g.qty += q;
          g.hours.push(h.id);
          groups.set(k, g);
        };
        add('base', h.hoursCenti, r.billRatePaise);
        add('ot', h.overtimeCenti, (r.billRatePaise * BigInt(Math.round(Number(r.otMultiplier) * 100))) / 100n);
      }
      const buckets = client.invoiceGrouping === 'placement' ? [...new Set([...groups.values()].map((g) => g.placementId))].map((pid) => [...groups.values()].filter((g) => g.placementId === pid)) : [[...groups.values()]];
      const ids: string[] = [];
      for (const lines of buckets) {
        const amounts = lines.map((l) => lineAmount(l.qty, l.rate));
        const taxable = amounts.reduce((s, a) => s + a, 0n);
        const t = this.taxes(taxable, gst.gstPct, supplierState, client.state);
        const inv = await tx.staffingInvoice.create({
          data: {
            organizationId: org, clientId: client.id, seriesId: series.id, kind: 'staffing', periodStart: day(from), periodEnd: day(to), supplierState, placeOfSupply: client.state, gstPct: gst.gstPct,
            taxablePaise: taxable, cgstPaise: t.cgst, sgstPaise: t.sgst, igstPaise: t.igst, totalPaise: t.total, po: dto.po?.trim() || null, createdBy: c.userId ?? null,
            lines: { create: lines.map((l, i) => ({ organizationId: org, placementId: l.placementId, description: `${l.desc} · ${qty(l.qty)} h`, qtyCenti: l.qty, ratePaise: l.rate, amountPaise: amounts[i]!, position: i + 1 })) },
          },
        });
        await tx.staffingHours.updateMany({ where: { id: { in: lines.flatMap((l) => l.hours) } }, data: { invoiceId: inv.id } });
        ids.push(inv.id);
      }
      await audit(tx, c, 'staffing.invoice.drafted', 'staffing_client', client.id, { month: dto.month, invoices: ids });
      return { ids };
    }, true);
  }

  /** A draft goes away and its hours are free again; an issued invoice never does. */
  async deleteDraft(ctx: TenantContext, user: ScopeUser, id: string) {
    return this.run(ctx, user, 'billing', async (tx, c) => {
      const inv = await tx.staffingInvoice.findFirst({ where: { id, organizationId: c.organizationId } });
      if (!inv) throw new NotFoundException('Invoice not found.');
      if (inv.status !== 'draft') throw new ConflictException('An issued invoice is never deleted. Raise a credit note.');
      await tx.staffingHours.updateMany({ where: { invoiceId: id }, data: { invoiceId: null } });
      await tx.staffingInvoice.delete({ where: { id } });
      await audit(tx, c, 'staffing.invoice.draft_deleted', 'staffing_invoice', id, {});
      return { removed: true };
    }, true);
  }

  /** Issue: today's date and the next number of its series (one per GSTIN per year; only up; never reused). */
  async issue(ctx: TenantContext, user: ScopeUser, id: string, dto: VersionDto) {
    return this.run(ctx, user, 'billing', async (tx, c) => {
      const inv = await tx.staffingInvoice.findFirst({ where: { id, organizationId: c.organizationId } });
      if (!inv) throw new NotFoundException('Invoice not found.');
      if (inv.status !== 'draft') throw new ConflictException('This invoice is issued already.');
      const today = todayIst();
      const number = await this.nextNumber(tx, inv.seriesId, today, 'invoice');
      const applies = (await settingFor(tx, c, 'staffing.einvoice.applies', { legalEntityId: '' })) === 'on';
      const { count } = await tx.staffingInvoice.updateMany({ where: { id, version: dto.version, status: 'draft' }, data: { status: 'issued', number, invoiceDate: day(today), irn: applies ? 'pending' : 'not_needed', issuedBy: c.userId ?? null, issuedAt: new Date(), version: { increment: 1 } } });
      if (!count) throw new ConflictException('Someone changed this invoice meanwhile. Reload it.');
      await audit(tx, c, 'staffing.invoice.issued', 'staffing_invoice', id, { number, total: toRupees(inv.totalPaise) });
      return { id, number };
    }, true);
  }

  /** The series' next number, taken under the row lock (concurrent issues wait); the series' year must be the date's. */
  private async nextNumber(tx: Tx, seriesId: string, date: string, kind: 'invoice' | 'credit') {
    const s = await tx.staffingInvoiceSeries.findFirst({ where: { id: seriesId } });
    if (!s) throw new BadRequestException('The invoice series is gone.');
    if (s.financialYear !== financialYear(date)) throw new BadRequestException(`The series is for ${s.financialYear}; open the ${financialYear(date)} series for this GSTIN first (Settings › Staffing desk).`);
    const up = await tx.staffingInvoiceSeries.update({ where: { id: s.id }, data: kind === 'invoice' ? { nextNumber: { increment: 1 } } : { nextCreditNumber: { increment: 1 } } });
    const n = (kind === 'invoice' ? up.nextNumber : up.nextCreditNumber) - 1;
    const number = `${s.prefix}${kind === 'credit' ? 'CN' : ''}${n}`;
    if (number.length > 16) throw new BadRequestException('A GST invoice number has at most 16 characters: shorten the series prefix.');
    return number;
  }

  /** A credit note against an issued invoice: its own CN number, the same tax treatment, never more than is left. */
  async creditNote(ctx: TenantContext, user: ScopeUser, id: string, dto: CreditNoteDto) {
    const amount = toPaise(dto.amount);
    if (amount == null) throw new BadRequestException('Enter the amount in rupees, up to 2 decimals.');
    return this.run(ctx, user, 'billing', (tx, c) => this.credit(tx, c, id, amount, dto.reason), true);
  }

  private async credit(tx: Tx, c: CompanyContext, id: string, amount: bigint, reason: string) {
    const inv = await tx.staffingInvoice.findFirst({ where: { id, organizationId: c.organizationId } });
    if (!inv) throw new NotFoundException('Invoice not found.');
    if (inv.status !== 'issued' || inv.kind !== 'staffing') throw new ConflictException('Only an issued invoice takes a credit note.');
    const before = await tx.staffingInvoice.aggregate({ where: { creditOf: id }, _sum: { taxablePaise: true } });
    const bad = creditProblem(inv.taxablePaise, before._sum.taxablePaise ?? 0n, amount);
    if (bad) throw new BadRequestException(bad);
    const today = todayIst();
    const number = await this.nextNumber(tx, inv.seriesId, today, 'credit');
    const t = this.taxes(amount, inv.gstPct.toString(), inv.supplierState, inv.placeOfSupply);
    const cn = await tx.staffingInvoice.create({
      data: {
        organizationId: c.organizationId, clientId: inv.clientId, seriesId: inv.seriesId, kind: 'credit_note', creditOf: inv.id, number, status: 'issued', invoiceDate: day(today), supplierState: inv.supplierState, placeOfSupply: inv.placeOfSupply, gstPct: inv.gstPct,
        taxablePaise: amount, cgstPaise: t.cgst, sgstPaise: t.sgst, igstPaise: t.igst, totalPaise: t.total, reason: reason.trim(), irn: inv.irn === 'not_needed' ? 'not_needed' : 'pending', issuedBy: c.userId ?? null, issuedAt: new Date(), createdBy: c.userId ?? null,
        lines: { create: [{ organizationId: c.organizationId, description: `Credit against ${inv.number}: ${reason.trim()}`.slice(0, 300), qtyCenti: 100, ratePaise: amount, amountPaise: amount, position: 1 }] },
      },
    });
    await audit(tx, c, 'staffing.invoice.credit_note', 'staffing_invoice', inv.id, { creditNote: number, amount: toRupees(amount), reason });
    return { id: cn.id, number };
  }

  /** HIR-31 past the window: cancel with a full credit note and reissue the same lines as a new draft (dated when issued). */
  async reissue(ctx: TenantContext, user: ScopeUser, id: string, dto: ReissueDto) {
    return this.run(ctx, user, 'billing', async (tx, c) => {
      const inv = await tx.staffingInvoice.findFirst({ where: { id, organizationId: c.organizationId }, include: { lines: true } });
      if (!inv) throw new NotFoundException('Invoice not found.');
      const credited = (await tx.staffingInvoice.aggregate({ where: { creditOf: id }, _sum: { taxablePaise: true } }))._sum.taxablePaise ?? 0n;
      if ((await tx.staffingReceiptAllocation.count({ where: { invoiceId: id } })) || credited) throw new ConflictException('This invoice has receipts or credit notes; correct it with a credit note instead.');
      const cn = await this.credit(tx, c, id, inv.taxablePaise, dto.reason);
      const copy = await tx.staffingInvoice.create({
        data: {
          organizationId: c.organizationId, clientId: inv.clientId, seriesId: inv.seriesId, kind: 'staffing', periodStart: inv.periodStart, periodEnd: inv.periodEnd, supplierState: inv.supplierState, placeOfSupply: inv.placeOfSupply, gstPct: inv.gstPct,
          taxablePaise: inv.taxablePaise, cgstPaise: inv.cgstPaise, sgstPaise: inv.sgstPaise, igstPaise: inv.igstPaise, totalPaise: inv.totalPaise, po: inv.po, reason: `Reissue of ${inv.number}`, createdBy: c.userId ?? null,
          lines: { create: inv.lines.map((l) => ({ organizationId: c.organizationId, placementId: l.placementId, description: l.description, qtyCenti: l.qtyCenti, ratePaise: l.ratePaise, amountPaise: l.amountPaise, position: l.position })) },
        },
      });
      await tx.staffingHours.updateMany({ where: { invoiceId: id }, data: { invoiceId: copy.id } });
      await audit(tx, c, 'staffing.invoice.reissued', 'staffing_invoice', id, { creditNote: cn.number, draft: copy.id });
      return { creditNoteId: cn.id, draftId: copy.id };
    }, true);
  }

  private async paidOf(tx: Tx, ids: string[]) {
    const alloc = await tx.staffingReceiptAllocation.groupBy({ by: ['invoiceId'], where: { invoiceId: { in: ids } }, _sum: { amountPaise: true, tdsPaise: true } });
    const cns = await tx.staffingInvoice.groupBy({ by: ['creditOf'], where: { creditOf: { in: ids } }, _sum: { totalPaise: true } });
    return (id: string, total: bigint) => {
      const a = alloc.find((x) => x.invoiceId === id);
      const paid = a?._sum.amountPaise ?? 0n;
      const credited = cns.find((x) => x.creditOf === id)?._sum.totalPaise ?? 0n;
      return { paid, tds: a?._sum.tdsPaise ?? 0n, credited, outstanding: total - paid - credited };
    };
  }

  private async window(tx: Tx, c: CompanyContext) {
    return { applies: (await settingFor(tx, c, 'staffing.einvoice.applies', { legalEntityId: '' })) === 'on', rule: await ruleValues<{ reportWithinDays: number; warnFromDay: number }>(tx, 'GST.EINVOICE_WINDOW') };
  }

  private invoiceStatus(inv: { status: string; kind: string }, o: { paid: bigint; outstanding: bigint }) {
    if (inv.status === 'draft') return 'draft';
    if (inv.kind === 'credit_note') return 'issued';
    return o.outstanding <= 0n ? 'paid' : o.paid > 0n ? 'part_paid' : 'issued';
  }

  list(ctx: TenantContext, user: ScopeUser) {
    return this.run(ctx, user, 'read', async (tx, c, a) => {
      const rows = await tx.staffingInvoice.findMany({ where: { organizationId: c.organizationId }, orderBy: [{ invoiceDate: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }], take: 2000 });
      const clients = new Map((await tx.staffingClient.findMany({ where: { organizationId: c.organizationId }, select: { id: true, name: true } })).map((x) => [x.id, x.name]));
      const of = await this.paidOf(tx, rows.map((r) => r.id));
      const w = await this.window(tx, c);
      const today = todayIst();
      return {
        canCreate: a.billing && !a.actingForOther,
        rows: rows.map((r) => {
          const o = of(r.id, r.totalPaise);
          return {
            id: r.id, number: r.number, client: clients.get(r.clientId) ?? '', kind: r.kind, date: iso(r.invoiceDate), period: r.periodStart ? iso(r.periodStart)!.slice(0, 7) : null,
            taxable: toRupees(r.taxablePaise), gst: toRupees(r.totalPaise - r.taxablePaise), total: toRupees(r.totalPaise), status: this.invoiceStatus(r, o),
            irn: r.status === 'draft' ? null : r.irn === 'not_needed' ? 'not_needed' : eInvoiceState(iso(r.invoiceDate)!, today, w.applies, w.rule),
          };
        }),
      };
    });
  }

  one(ctx: TenantContext, user: ScopeUser, id: string) {
    return this.run(ctx, user, 'read', async (tx, c, a) => {
      const inv = await tx.staffingInvoice.findFirst({ where: { id, organizationId: c.organizationId }, include: { lines: { orderBy: { position: 'asc' } } } });
      if (!inv) throw new NotFoundException('Invoice not found.');
      const client = await this.staffing.client(tx, c, inv.clientId);
      const credits = await tx.staffingInvoice.findMany({ where: { creditOf: id }, orderBy: { createdAt: 'asc' } });
      const o = (await this.paidOf(tx, [id]))(id, inv.totalPaise);
      const w = await this.window(tx, c);
      const dueDays = await this.dueDays(tx, c, inv.clientId);
      return {
        canEdit: a.billing && !a.actingForOther,
        invoice: {
          id: inv.id, number: inv.number, kind: inv.kind, creditOf: inv.creditOf, client: client.name, clientState: IN_STATES[inv.placeOfSupply] ?? inv.placeOfSupply, supplierState: IN_STATES[inv.supplierState] ?? inv.supplierState,
          interState: inv.supplierState !== inv.placeOfSupply, gstPct: inv.gstPct.toString(), date: iso(inv.invoiceDate), dueOn: inv.invoiceDate ? addDays(iso(inv.invoiceDate)!, dueDays) : null, period: inv.periodStart ? `${iso(inv.periodStart)} to ${iso(inv.periodEnd)}` : null, po: inv.po, reason: inv.reason,
          taxable: toRupees(inv.taxablePaise), cgst: toRupees(inv.cgstPaise), sgst: toRupees(inv.sgstPaise), igst: toRupees(inv.igstPaise), total: toRupees(inv.totalPaise),
          paid: toRupees(o.paid), outstanding: toRupees(o.outstanding < 0n ? 0n : o.outstanding), status: this.invoiceStatus(inv, o), irn: inv.irn, version: inv.version,
          window: inv.status === 'issued' && inv.irn !== 'not_needed' ? eInvoiceState(iso(inv.invoiceDate)!, todayIst(), w.applies, w.rule) : null,
        },
        lines: inv.lines.map((l) => ({ description: l.description, qty: qty(l.qtyCenti), rate: toRupees(l.ratePaise), amount: toRupees(l.amountPaise) })),
        creditNotes: credits.map((x) => ({ id: x.id, number: x.number, date: iso(x.invoiceDate), amount: toRupees(x.totalPaise), reason: x.reason })),
        rule: w.rule,
      };
    });
  }

  /* ---------------- HIR-19 receivables ---------------- */

  receivables(ctx: TenantContext, user: ScopeUser) {
    return this.run(ctx, user, 'billing', async (tx, c, a) => {
      const org = c.organizationId;
      const invs = await tx.staffingInvoice.findMany({ where: { organizationId: org, kind: 'staffing', status: 'issued' }, orderBy: { invoiceDate: 'asc' } });
      const of = await this.paidOf(tx, invs.map((i) => i.id));
      const clients = await tx.staffingClient.findMany({ where: { organizationId: org, id: { in: [...new Set(invs.map((i) => i.clientId))] } }, select: { id: true, name: true, paymentTermsDays: true, tdsSection: true } });
      const terms = Number(await settingFor(tx, c, 'staffing.payment_terms_days', { legalEntityId: '' }));
      const schedule = await settingFor(tx, c, 'staffing.dunning.schedule', { legalEntityId: '' });
      const today = todayIst();
      const rows = [];
      for (const i of invs) {
        const o = of(i.id, i.totalPaise);
        if (o.outstanding <= 0n) continue;
        const cl = clients.find((x) => x.id === i.clientId)!;
        const due = addDays(iso(i.invoiceDate)!, cl.paymentTermsDays ?? terms);
        rows.push({
          invoiceId: i.id, invoice: i.number, clientId: cl.id, client: cl.name, tdsSection: cl.tdsSection, date: iso(i.invoiceDate), dueOn: due, bucket: ageingBucket(iso(i.invoiceDate)!, today), overdueDays: Math.max(0, daysBetween(due, today)),
          total: toRupees(i.totalPaise), outstanding: toRupees(o.outstanding), tdsDeducted: toRupees(o.tds), tds26as: i.tds26asPaise != null ? toRupees(i.tds26asPaise) : null, dispute: i.dispute, nextReminder: i.dispute ? null : nextReminder(due, today, schedule), version: i.version,
        });
      }
      return { canRecord: a.billing && !a.actingForOther, schedule, rows };
    });
  }

  /** A client's payment: cash + TDS settle the chosen invoices exactly; TDS spreads in proportion. */
  async receipt(ctx: TenantContext, user: ScopeUser, dto: ReceiptDto) {
    const amount = toPaise(dto.amount);
    const tds = toPaise(dto.tds ?? '0');
    if (amount == null || tds == null || amount + tds <= 0n) throw new BadRequestException('Enter the amount received.');
    if (dto.receivedOn > todayIst()) throw new BadRequestException('A receipt cannot be in the future.');
    const allocs = dto.allocations.map((x) => ({ invoiceId: x.invoiceId, amount: toPaise(x.amount) }));
    if (allocs.some((x) => x.amount == null || x.amount <= 0n)) throw new BadRequestException('Each allocation is an amount in rupees.');
    if (new Set(allocs.map((x) => x.invoiceId)).size !== allocs.length) throw new BadRequestException('Allocate to each invoice once.');
    if (allocs.reduce((s, x) => s + x.amount!, 0n) !== amount + tds) throw new BadRequestException('The allocations must add up to the amount received plus TDS.');
    return this.run(ctx, user, 'billing', async (tx, c) => {
      const org = c.organizationId;
      await this.staffing.client(tx, c, dto.clientId);
      const invs = await tx.staffingInvoice.findMany({ where: { organizationId: org, id: { in: allocs.map((x) => x.invoiceId) }, clientId: dto.clientId, kind: 'staffing', status: 'issued' } });
      if (invs.length !== allocs.length) throw new BadRequestException('Allocate only to this client’s issued invoices.');
      const of = await this.paidOf(tx, invs.map((i) => i.id));
      for (const x of allocs) {
        const i = invs.find((v) => v.id === x.invoiceId)!;
        if (x.amount! > of(i.id, i.totalPaise).outstanding) throw new BadRequestException(`More than is outstanding on ${i.number}.`);
      }
      const split = splitTds(tds, allocs.map((x) => x.amount!));
      const r = await tx.staffingReceipt.create({ data: { organizationId: org, clientId: dto.clientId, receivedOn: day(dto.receivedOn), amountPaise: amount, tdsPaise: tds, reference: dto.reference?.trim() || null, createdBy: c.userId ?? null } });
      await tx.staffingReceiptAllocation.createMany({ data: allocs.map((x, i) => ({ organizationId: org, receiptId: r.id, invoiceId: x.invoiceId, amountPaise: x.amount!, tdsPaise: split[i]! })) });
      await audit(tx, c, 'staffing.receipt.recorded', 'staffing_client', dto.clientId, { receiptId: r.id, amount: toRupees(amount), tds: toRupees(tds), invoices: invs.map((i) => i.number) });
      return { id: r.id };
    }, true);
  }

  /** The 26AS amount seen for an invoice's TDS, and a dispute (which pauses reminders). */
  async collection(ctx: TenantContext, user: ScopeUser, id: string, dto: CollectionDto) {
    return this.run(ctx, user, 'billing', async (tx, c) => {
      const inv = await tx.staffingInvoice.findFirst({ where: { id, organizationId: c.organizationId, kind: 'staffing', status: 'issued' } });
      if (!inv) throw new NotFoundException('Invoice not found.');
      const tds26 = dto.tds26as === undefined ? undefined : dto.tds26as === null ? null : toPaise(dto.tds26as);
      if (tds26 === null && dto.tds26as) throw new BadRequestException('Enter the 26AS amount in rupees.');
      const { count } = await tx.staffingInvoice.updateMany({ where: { id, version: dto.version }, data: { ...(tds26 !== undefined ? { tds26asPaise: tds26 } : {}), ...(dto.dispute !== undefined ? { dispute: dto.dispute?.trim() || null } : {}), version: { increment: 1 } } });
      if (!count) throw new ConflictException('Someone changed this invoice meanwhile. Reload it.');
      await audit(tx, c, 'staffing.invoice.collection', 'staffing_invoice', id, { tds26as: dto.tds26as, dispute: dto.dispute });
      return { id };
    }, true);
  }

  /* ---------------- HIR-30 fees and guarantee ---------------- */

  terms(ctx: TenantContext, user: ScopeUser, clientId: string) {
    return this.run(ctx, user, 'read', async (tx, c, a) => {
      const client = await this.staffing.client(tx, c, clientId);
      const t = await tx.staffingClientTerms.findFirst({ where: { clientId, organizationId: c.organizationId } });
      return {
        client: { id: client.id, name: client.name, contractStart: iso(client.contractStart), contractEnd: iso(client.contractEnd) },
        canEdit: a.manage && !a.actingForOther,
        terms: t ? { feeKind: t.feeKind, feePct: t.feePctBp != null ? (t.feePctBp / 100).toFixed(2) : null, feeAmount: t.feePaise != null ? toRupees(t.feePaise) : null, taper: (t.taper as { fromMonth: number; pctBp: number }[]).map((x) => ({ fromMonth: x.fromMonth, pct: (x.pctBp / 100).toFixed(2) })), guaranteeDays: t.guaranteeDays, remedy: t.remedy, version: t.version } : null,
      };
    });
  }

  async saveTerms(ctx: TenantContext, user: ScopeUser, clientId: string, dto: ClientTermsDto) {
    const pctBp = dto.feeKind === 'percent' ? pctToBp(dto.feePct ?? '') : null;
    const fee = dto.feeKind === 'fixed' ? toPaise(dto.feeAmount ?? '') : null;
    if (dto.feeKind === 'percent' && !pctBp) throw new BadRequestException('Enter the fee as a % of CTC, up to 2 decimals.');
    if (dto.feeKind === 'fixed' && (fee == null || fee <= 0n)) throw new BadRequestException('Enter the fixed fee in rupees.');
    const taper = dto.taper.map((x) => ({ fromMonth: x.fromMonth, pctBp: pctToBp(x.pct) }));
    if (taper.some((x) => x.pctBp == null)) throw new BadRequestException('Each taper row is a % of CTC, up to 2 decimals.');
    const bad = taperProblem(taper as { fromMonth: number; pctBp: number }[]);
    if (bad) throw new BadRequestException(bad);
    return this.run(ctx, user, 'manage', async (tx, c) => {
      await this.staffing.client(tx, c, clientId);
      const data = { feeKind: dto.feeKind, feePctBp: pctBp, feePaise: fee, taper: taper as Prisma.InputJsonValue, guaranteeDays: dto.guaranteeDays, remedy: dto.remedy, updatedBy: c.userId ?? null, updatedAt: new Date() };
      const cur = await tx.staffingClientTerms.findFirst({ where: { clientId, organizationId: c.organizationId } });
      if (cur) {
        const { count } = await tx.staffingClientTerms.updateMany({ where: { clientId, version: dto.version ?? -1 }, data: { ...data, version: { increment: 1 } } });
        if (!count) throw new ConflictException('Someone changed these terms meanwhile. Reload them.');
      } else await tx.staffingClientTerms.create({ data: { clientId, organizationId: c.organizationId, ...data } });
      await audit(tx, c, 'staffing.client.terms_saved', 'staffing_client', clientId, { feeKind: dto.feeKind, fee: dto.feePct ?? dto.feeAmount, guaranteeDays: dto.guaranteeDays, remedy: dto.remedy });
      return { clientId };
    }, true);
  }

  /* ---------------- answer 490: vendor invoices ---------------- */

  vendorBills(ctx: TenantContext, user: ScopeUser) {
    return this.run(ctx, user, 'billing', async (tx, c, a) => ({ canEdit: a.billing && !a.actingForOther, rows: await this.vendorRows(tx, c) }));
  }

  /** Proposed (approved hours not yet billed, by placement and month) and confirmed vendor invoices. */
  private async vendorRows(tx: Tx, c: CompanyContext) {
      const org = c.organizationId;
      const vp = await tx.staffingPlacement.findMany({ where: { organizationId: org, supply: 'vendor' } });
      const hours = await tx.staffingHours.findMany({ where: { organizationId: org, placementId: { in: vp.map((p) => p.id) }, status: 'approved', vendorBillId: null } });
      const agencies = await tx.agency.findMany({ where: { organizationId: org, id: { in: vp.map((p) => p.agencyId!).filter(Boolean) } }, select: { id: true, name: true, gstin: true, pan: true, tdsSection: true } });
      const tdsRule = await ruleValues<Record<string, { individualPct: string; otherPct: string }>>(tx, 'TDS.SECTIONS');
      const gstRule = await ruleValues<{ gstPct: string }>(tx, 'GST.STAFFING_RATE');
      const proposed = new Map<string, { placementId: string; month: string; qty: number }>();
      for (const h of hours) {
        const k = `${h.placementId}|${iso(h.weekStart)!.slice(0, 7)}`;
        const g = proposed.get(k) ?? { placementId: h.placementId, month: iso(h.weekStart)!.slice(0, 7), qty: 0 };
        g.qty += h.hoursCenti + h.overtimeCenti;
        proposed.set(k, g);
      }
      const view = (p: (typeof vp)[number], month: string, qtyC: number) => {
        const ag = agencies.find((x) => x.id === p.agencyId);
        const net = lineAmount(qtyC, p.vendorRatePaise!);
        const section = ag?.tdsSection ?? '194C';
        const r = tdsRule[section];
        const pct = r ? (ag?.pan && ['P', 'H'].includes(ag.pan[3]!) ? r.individualPct : r.otherPct) : '0';
        return { vendor: ag?.name ?? '', worker: p.workerName, placementId: p.id, month, hours: qty(qtyC), rate: toRupees(p.vendorRatePaise!), net: toRupees(net), gst: toRupees(ag?.gstin ? gstSplit(net, pctToBp(gstRule.gstPct)!, true).igst : 0n), tdsSection: section, tds: toRupees(lineAmount(pctToBp(pct)!, net) / 100n) };
      };
      const bills = await tx.staffingVendorBill.findMany({ where: { organizationId: org }, orderBy: { month: 'desc' }, take: 500 });
      return [
          ...[...proposed.values()].map((g) => ({ id: null, status: 'waiting' as const, vendorInvoiceNo: null, ...view(vp.find((p) => p.id === g.placementId)!, g.month, g.qty) })),
          ...bills.map((b) => ({ id: b.id, status: b.status, vendorInvoiceNo: b.vendorInvoiceNo, vendor: agencies.find((x) => x.id === b.agencyId)?.name ?? '', worker: vp.find((p) => p.id === b.placementId)?.workerName ?? '', placementId: b.placementId, month: iso(b.month)!.slice(0, 7), hours: qty(b.qtyCenti), rate: toRupees(b.ratePaise), net: toRupees(b.netPaise), gst: toRupees(b.gstPaise), tdsSection: b.tdsSection, tds: toRupees(b.tdsPaise) })),
        ];
  }

  /** The vendor confirmed its invoice for a month: the proposal is fixed with the vendor's number. */
  async confirmVendorBill(ctx: TenantContext, user: ScopeUser, dto: VendorBillDto) {
    return this.run(ctx, user, 'billing', async (tx, c) => {
      const org = c.organizationId;
      const p = await tx.staffingPlacement.findFirst({ where: { id: dto.placementId, organizationId: org, supply: 'vendor' } });
      if (!p) throw new NotFoundException('Vendor placement not found.');
      const from = `${dto.month}-01`;
      const to = addDays(new Date(Date.UTC(Number(dto.month.slice(0, 4)), Number(dto.month.slice(5, 7)), 1)).toISOString().slice(0, 10), -1);
      const hours = await tx.staffingHours.findMany({ where: { organizationId: org, placementId: p.id, status: 'approved', vendorBillId: null, weekStart: { gte: day(from), lte: day(to) } } });
      if (!hours.length) throw new BadRequestException('No approved hours to bill for this month.');
      const listed = (await this.vendorRows(tx, c)).find((r) => r.placementId === p.id && r.month === dto.month && r.id === null);
      if (!listed) throw new ConflictException('This month is billed already.');
      const b = await tx.staffingVendorBill
        .create({ data: { organizationId: org, agencyId: p.agencyId!, placementId: p.id, month: day(from), qtyCenti: hours.reduce((s, h) => s + h.hoursCenti + h.overtimeCenti, 0), ratePaise: p.vendorRatePaise!, netPaise: toPaise(listed.net)!, gstPaise: toPaise(listed.gst)!, tdsSection: listed.tdsSection, tdsPaise: toPaise(listed.tds)!, vendorInvoiceNo: dto.vendorInvoiceNo.trim(), createdBy: c.userId ?? null } })
        .catch((e: unknown) => {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('This month is billed already.');
          throw e;
        });
      await tx.staffingHours.updateMany({ where: { id: { in: hours.map((h) => h.id) } }, data: { vendorBillId: b.id } });
      await audit(tx, c, 'staffing.vendor_bill.confirmed', 'staffing_vendor_bill', b.id, { month: dto.month, vendorInvoiceNo: dto.vendorInvoiceNo, net: listed.net });
      return { id: b.id };
    }, true);
  }

  async vendorBillPaid(ctx: TenantContext, user: ScopeUser, id: string, dto: VendorBillPaidDto) {
    if (dto.paidOn > todayIst()) throw new BadRequestException('A payment cannot be in the future.');
    return this.run(ctx, user, 'billing', async (tx, c) => {
      const { count } = await tx.staffingVendorBill.updateMany({ where: { id, organizationId: c.organizationId, status: 'confirmed' }, data: { status: 'paid', paidOn: day(dto.paidOn) } });
      if (!count) throw new NotFoundException('Vendor invoice not found or already paid.');
      await audit(tx, c, 'staffing.vendor_bill.paid', 'staffing_vendor_bill', id, { paidOn: dto.paidOn });
      return { id };
    }, true);
  }
}
