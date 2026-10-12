import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import type { ScopeUser, Viewer } from '../access/scope';
import { NotificationsService } from '../notifications/notifications.service';
import { StatutoryRulesService } from '../statutory/statutory.service';
import { StatutoryError, inForce, type RuleSet } from '../statutory/evaluator';
import { asDate, dateOf, monthRange } from '../time/time-core';
import { calculatePayslip } from './calc';
import { nextMonth, taxYearOf } from './tax';
import { PayRunsService } from './runs.service';
import { PayKey, entitiesFor, payScope, payViewer, requireSelf } from './pay-access';
import type { ConfirmBaseDto, OffcycleItemDto, OverpaymentDto, WorksheetApproveDto, WorksheetCreateDto } from './dto-5g';

// Batch 5g (M03-BUILD-DESIGN §5.8, PAY-7.01 … 7.03, 7.07):
//   off-cycle items   what a bonus, arrears, correction or payment run pays (the run's approval is the usual one);
//   arrears           per month and component, corrected − as-paid: the corrected pay is worked out again by the same
//                     engine from today's records; as-paid is the approved payslips (plus arrears already approved), else
//                     the imported history, else it is missing and someone confirms it with a reason. Approved by someone
//                     other than its maker: what is owed is paid as one-time pay under the same components (so PF, ESI and
//                     tax follow their flags); what was overpaid becomes a recovery the employee must agree to;
//   proposals         a rule set published for a past date that differs from what approved payslips used: one proposal per
//                     legal entity and rule version, accepted (worksheets for each person) or dismissed with a reason;
//   overpayments      a recovery plan by instalments, recovered only with the employee's consent, within the deduction
//                     limits; the rest written off by someone else (step-up); cross-year ones are flagged for tax.

const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);
/** One decision at a time on a record (two approvals at once would pay twice). */
const lock = (tx: Tx, key: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
const NIL = '00000000-0000-0000-0000-000000000000';
const EDITABLE = ['draft', 'calculated', 'in_review', 'reopened'];
// DECISION NEEDED: worksheets cover pay (earnings). When a past-dated rule changes a statutory deduction (PF, ESI, PT),
// who bears the difference for months already paid: recovered from the employee (with consent) or borne by the company?
// Today the statutory side is settled by the supplementary filing (5f) and the employee side is not recovered. Also, an
// overpayment from an earlier tax year is listed (crossYear) but its tax effect (revised Form 16 / s.89) is handled by hand.
const NOT_PAY = ['IN.TDS', 'IN.TAXDED'];
const months = (from: string, to: string) => {
  const out: string[] = [];
  for (let m = from; m <= to; m = nextMonth(m)) out.push(m);
  return out;
};

/** Approved payslips whose rule versions are no longer the ones in force for their month, by statute and new version. */
export function staleRuleUses(slips: { employeeId: string; month: string; ruleVersions: Record<string, string> }[], rules: readonly RuleSet[]) {
  const found = new Map<string, { statute: string; jur: string; version: string; periods: Set<string>; employees: Set<string> }>();
  for (const s of slips)
    for (const [k, used] of Object.entries(s.ruleVersions ?? {})) {
      const [statute, jur] = k.split('|');
      if (NOT_PAY.includes(statute)) continue;
      const now = inForce(rules, statute, [jur], monthRange(s.month).to);
      if (!now || now.version === used) continue;
      const key = `${statute}|${jur}|${now.version}`;
      const x = found.get(key) ?? { statute, jur, version: now.version, periods: new Set<string>(), employees: new Set<string>() };
      x.periods.add(s.month);
      x.employees.add(s.employeeId);
      found.set(key, x);
    }
  return [...found.values()].map((x) => ({ statute: x.statute, jurisdiction: x.jur, version: x.version, periods: [...x.periods].sort(), employees: [...x.employees].sort() }));
}

@Injectable()
export class ArrearsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly rules: StatutoryRulesService,
    private readonly runs: PayRunsService,
    private readonly notifications: NotificationsService,
  ) {}

  private async viewer(user: ScopeUser) {
    const v = await payViewer(this.prisma, this.tenantPrisma, user);
    requireSelf(v);
    return v;
  }

  private async scoped(tx: Tx, c: CompanyContext, v: Viewer, keys: PayKey[]) {
    const ids = [...new Set((await Promise.all(keys.map((k) => entitiesFor(tx, c, v, k)))).flat())];
    await payScope(tx, ids);
    return ids;
  }

  /** The person's employment in one of the entities (the latest). */
  private async employment(tx: Tx, org: string, employeeId: string, entityIds: string[]) {
    const em = await tx.employment.findFirst({ where: { organizationId: org, employeeId, legalEntityId: { in: entityIds } }, orderBy: { joinedOn: 'desc' } });
    if (!em) throw new NotFoundException('Not found');
    return em;
  }

  // ------------------------------------------------------------------------------------------ off-cycle items (PAY-7.01)

  async addItem(ctx: TenantContext, user: ScopeUser, runId: string, dto: OffcycleItemDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const ids = await this.scoped(tx, c, v, ['payroll.offcycle.prepare']);
      const run = await tx.payrollRun.findFirst({ where: { organizationId: org, id: runId } });
      if (!run || !ids.includes(run.legalEntityId) || run.runType !== 'offcycle') throw new NotFoundException('Not found');
      if (run.offcycleKind === 'fnf') throw new ConflictException('F&F lines are changed on the settlement.');
      if (!EDITABLE.includes(run.status)) throw new ConflictException(`A ${run.status} run takes no new items.`);
      const em = await this.employment(tx, org, dto.employeeId, [run.legalEntityId]);
      const comp = await tx.payComponent.findFirst({ where: { organizationId: org, code: dto.componentCode, status: 'active' } });
      if (!comp || comp.statutory || !['earning', 'deduction'].includes(comp.kind)) throw new BadRequestException('Choose an earning or deduction component (not a statutory one).');
      const row = await tx.oneTimePay.create({
        data: {
          organizationId: org,
          legalEntityId: run.legalEntityId,
          employeeId: em.employeeId,
          employmentId: em.id,
          componentCode: comp.code,
          amount: dto.amount,
          periodStart: run.periodStart,
          reason: dto.reason,
          label: dto.label ?? null,
          status: 'approved',
          runId: run.id,
          createdBy: v.userId!,
        },
      });
      await audit(tx, c, 'payroll.offcycle.item_added', 'payroll_run', run.id, { itemId: row.id, employeeId: em.employeeId, componentCode: comp.code, amount: dto.amount, reason: dto.reason });
      return { id: row.id };
    });
  }

  async removeItem(ctx: TenantContext, user: ScopeUser, runId: string, itemId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = await this.scoped(tx, c, v, ['payroll.offcycle.prepare']);
      const run = await tx.payrollRun.findFirst({ where: { organizationId: c.organizationId, id: runId } });
      const row = run ? await tx.oneTimePay.findFirst({ where: { organizationId: c.organizationId, id: itemId, runId: run.id, status: 'approved' } }) : null;
      if (!run || !row || !ids.includes(run.legalEntityId) || run.offcycleKind === 'fnf') throw new NotFoundException('Not found');
      if (!EDITABLE.includes(run.status)) throw new ConflictException(`A ${run.status} run keeps its items.`);
      await tx.oneTimePay.update({ where: { id: row.id }, data: { status: 'cancelled' } });
      await audit(tx, c, 'payroll.offcycle.item_removed', 'payroll_run', run.id, { itemId: row.id });
      return { id: row.id, status: 'cancelled' };
    });
  }

  // ------------------------------------------------------------------------------------------ arrears worksheets (PAY-7.02)

  private async sheetView(tx: Tx, org: string, w: Prisma.ArrearsWorksheetGetPayload<object>) {
    const lines = await tx.arrearsWorksheetLine.findMany({ where: { organizationId: org, worksheetId: w.id }, orderBy: [{ period: 'asc' }, { componentCode: 'asc' }] });
    return {
      id: w.id,
      employeeId: w.employeeId,
      source: w.source,
      sourceRef: w.sourceRef,
      from: dateOf(w.fromMonth).slice(0, 7),
      to: dateOf(w.toMonth).slice(0, 7),
      status: w.status,
      total: w.total.toFixed(2),
      reason: w.reason,
      payMonth: w.payMonth ? dateOf(w.payMonth).slice(0, 7) : null,
      runId: w.runId,
      createdBy: w.createdBy,
      approvedBy: w.approvedBy,
      missing: lines.filter((l) => l.baseSource === 'missing').length,
      lines: lines.map((l) => ({
        id: l.id,
        period: dateOf(l.period).slice(0, 7),
        componentCode: l.componentCode,
        asPaid: l.asPaid?.toFixed(2) ?? null,
        corrected: l.corrected.toFixed(2),
        difference: l.difference?.toFixed(2) ?? null,
        base: l.baseSource,
        confirmReason: l.confirmReason,
      })),
    };
  }

  /** Works out one person's worksheet (in the caller's transaction, the pay guard open for the entity). */
  async worksheetIn(
    tx: Tx,
    c: CompanyContext,
    by: string,
    em: Prisma.EmploymentGetPayload<object>,
    from: string,
    to: string,
    source: 'change' | 'rule' | 'manual',
    sourceRef: string | null,
    reason: string,
  ) {
    const org = c.organizationId;
    const today = todayIst().slice(0, 7);
    if (from > to) throw new BadRequestException('The first month is after the last.');
    if (to > today) throw new BadRequestException('Arrears are for months already paid, not future ones.');
    const list = months(from, to);
    if (list.length > 36) throw new BadRequestException('Arrears go back at most 36 months at a time.');
    const rules = await this.rules.published();
    const w = await tx.arrearsWorksheet.create({
      data: {
        organizationId: org,
        legalEntityId: em.legalEntityId,
        employeeId: em.employeeId,
        employmentId: em.id,
        source,
        sourceRef,
        fromMonth: asDate(`${from}-01`),
        toMonth: asDate(`${to}-01`),
        reason,
        createdBy: by,
      },
    });
    let total = D(0);
    for (const m of list) {
      const { from: ms, to: me } = monthRange(m);
      if (dateOf(em.joinedOn) > me || (em.exitedOn && dateOf(em.exitedOn) < ms)) continue;
      const member = await tx.payGroupMember.findFirst({
        where: { organizationId: org, employmentId: em.id, validFrom: { lte: asDate(me) }, OR: [{ validTo: null }, { validTo: { gte: asDate(ms) } }] },
        orderBy: { validFrom: 'desc' },
      });
      const group = member ? { id: member.payGroupId } : await tx.payGroup.findFirst({ where: { organizationId: org, legalEntityId: em.legalEntityId }, orderBy: { createdAt: 'asc' } });
      if (!group) throw new BadRequestException('The person is in no pay group.');
      // The month as the regular run would pay it today (today's records, the rules in force for that month).
      const run = {
        id: NIL,
        organizationId: org,
        legalEntityId: em.legalEntityId,
        payGroupId: group.id,
        periodStart: asDate(ms),
        periodEnd: asDate(me),
        runType: 'regular',
        offcycleKind: null,
        status: 'draft',
        calcVersion: 0,
        wfRequestId: null,
        preparedBy: by,
        approvedBy: null,
        approvedAt: null,
        publishedAt: null,
        postedAt: null,
        totals: null,
        voidReason: null,
        version: 1,
        createdAt: new Date(),
      };
      let corrected: Map<string, Prisma.Decimal>;
      try {
        const r = calculatePayslip(await this.runs.snapshot(tx, c, run, em.id, rules), rules);
        corrected = new Map();
        for (const l of r.lines.filter((x) => x.kind === 'earning')) corrected.set(l.code, (corrected.get(l.code) ?? D(0)).add(l.amount));
      } catch (e) {
        if (e instanceof StatutoryError || (e as { field?: string }).field) throw new BadRequestException(`${m}: ${(e as Error).message}`);
        throw e;
      }
      // As paid: the approved regular payslip of the month (off-cycle pay is outside it), and arrears for the month approved
      // earlier; else the imported history.
      const slips = await tx.payslip.findMany({ where: { organizationId: org, employmentId: em.id, periodStart: asDate(ms), status: 'approved', runType: 'regular' }, select: { id: true } });
      const paid = new Map<string, Prisma.Decimal>();
      const put = (code: string, x: Prisma.Decimal.Value) => paid.set(code, (paid.get(code) ?? D(0)).add(x));
      let base: 'payslip' | 'import' | 'missing' = 'missing';
      if (slips.length) {
        base = 'payslip';
        for (const l of await tx.payslipLine.findMany({ where: { organizationId: org, payslipId: { in: slips.map((s) => s.id) }, kind: 'earning' } })) put(l.componentCode, l.amount);
      } else {
        const imported = await tx.asPaidLine.findMany({ where: { organizationId: org, employmentId: em.id, periodStart: asDate(ms) } });
        if (imported.length) {
          base = 'import';
          for (const l of imported) put(l.componentCode, l.amount);
        }
      }
      if (base !== 'missing') {
        const earlier = await tx.arrearsWorksheetLine.findMany({
          where: {
            organizationId: org,
            employeeId: em.employeeId,
            period: asDate(ms),
            difference: { not: null },
            worksheetId: { in: (await tx.arrearsWorksheet.findMany({ where: { organizationId: org, employmentId: em.id, status: 'approved' }, select: { id: true } })).map((x) => x.id) },
          },
        });
        for (const l of earlier) put(l.componentCode, l.difference!);
      }
      for (const code of [...new Set([...corrected.keys(), ...paid.keys()])].sort()) {
        const cor = corrected.get(code) ?? D(0);
        const asPaid = base === 'missing' ? null : (paid.get(code) ?? D(0));
        if (asPaid && cor.eq(asPaid)) continue;
        const difference = asPaid ? cor.sub(asPaid) : null;
        if (difference) total = total.add(difference);
        await tx.arrearsWorksheetLine.create({
          data: {
            organizationId: org,
            legalEntityId: em.legalEntityId,
            employeeId: em.employeeId,
            worksheetId: w.id,
            period: asDate(ms),
            componentCode: code,
            asPaid,
            corrected: cor,
            difference,
            baseSource: base,
          },
        });
      }
    }
    const done = await tx.arrearsWorksheet.update({ where: { id: w.id }, data: { total } });
    await audit(tx, c, 'payroll.arrears.worksheet_created', 'arrears_worksheet', w.id, { employeeId: em.employeeId, from, to, source, sourceRef, total: total.toFixed(2) });
    return done;
  }

  async createWorksheet(ctx: TenantContext, user: ScopeUser, dto: WorksheetCreateDto) {
    const v = await this.viewer(user);
    return inCompany(
      this.tenantPrisma,
      ctx,
      async (tx, c) => {
        const ids = await this.scoped(tx, c, v, ['payroll.arrears.approve']);
        const em = await this.employment(tx, c.organizationId, dto.employeeId, ids);
        if (dto.changeId && !(await tx.employeeChange.findFirst({ where: { organizationId: c.organizationId, id: dto.changeId, employeeId: em.employeeId }, select: { id: true } })))
          throw new BadRequestException('That change is not this person’s.');
        const w = await this.worksheetIn(tx, c, v.userId!, em, dto.from, dto.to, dto.changeId ? 'change' : 'manual', dto.changeId ?? null, dto.reason);
        return this.sheetView(tx, c.organizationId, w);
      },
      { timeout: 60_000 },
    );
  }

  private async sheetIn(tx: Tx, c: CompanyContext, v: Viewer, id: string) {
    const ids = await this.scoped(tx, c, v, ['payroll.arrears.approve']);
    await lock(tx, `arrears:${id}`);
    const w = await tx.arrearsWorksheet.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!w || !ids.includes(w.legalEntityId)) throw new NotFoundException('Not found');
    return w;
  }

  async worksheets(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = await this.scoped(tx, c, v, ['payroll.arrears.approve']);
      const rows = await tx.arrearsWorksheet.findMany({ where: { organizationId: c.organizationId, legalEntityId: { in: ids } }, orderBy: { createdAt: 'desc' }, take: 200 });
      return Promise.all(rows.map((w) => this.sheetView(tx, c.organizationId, w)));
    });
  }

  async worksheet(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => this.sheetView(tx, c.organizationId, await this.sheetIn(tx, c, v, id)));
  }

  /** A month with no payslip and no imported history: someone records what was paid, with a reason. */
  async confirmBase(ctx: TenantContext, user: ScopeUser, id: string, dto: ConfirmBaseDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const w = await this.sheetIn(tx, c, v, id);
      if (w.status !== 'draft') throw new ConflictException('Only a draft worksheet changes.');
      const lines = await tx.arrearsWorksheetLine.findMany({ where: { organizationId: org, worksheetId: w.id, period: asDate(`${dto.period}-01`), baseSource: 'missing' } });
      if (!lines.length) throw new ConflictException(`${dto.period} needs no base.`);
      for (const x of dto.lines) if (!lines.some((l) => l.componentCode === x.componentCode)) throw new BadRequestException(`${x.componentCode} is not a line of ${dto.period}.`);
      for (const l of lines) {
        const asPaid = D(dto.lines.find((x) => x.componentCode === l.componentCode)?.asPaid ?? 0);
        await tx.arrearsWorksheetLine.update({ where: { id: l.id }, data: { asPaid, difference: l.corrected.sub(asPaid), baseSource: 'confirmed', confirmedBy: v.userId, confirmReason: dto.reason } });
      }
      const all = await tx.arrearsWorksheetLine.findMany({ where: { organizationId: org, worksheetId: w.id, difference: { not: null } }, select: { difference: true } });
      const done = await tx.arrearsWorksheet.update({ where: { id: w.id }, data: { total: all.reduce((t, l) => t.add(l.difference!), D(0)), version: { increment: 1 } } });
      await audit(tx, c, 'payroll.arrears.base_confirmed', 'arrears_worksheet', w.id, { period: dto.period, lines: dto.lines, reason: dto.reason });
      return this.sheetView(tx, org, done);
    });
  }

  /** Someone other than its maker approves: what is owed is paid, what was overpaid becomes a recovery to agree to. */
  async approveWorksheet(ctx: TenantContext, user: ScopeUser, id: string, dto: WorksheetApproveDto) {
    const v = await this.viewer(user);
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const w = await this.sheetIn(tx, c, v, id);
      if (w.status !== 'draft') throw new ConflictException(`A ${w.status} worksheet is not approved again.`);
      if (w.createdBy === v.userId) throw new ForbiddenException('Someone other than the person who made the worksheet approves it.');
      const lines = await tx.arrearsWorksheetLine.findMany({ where: { organizationId: org, worksheetId: w.id } });
      if (lines.some((l) => l.baseSource === 'missing')) throw new ConflictException('Confirm what was paid for the months with no payslip or imported history first.');
      // Net by component: owed amounts are paid under their own component; overpaid ones become one recovery.
      const net = new Map<string, Prisma.Decimal>();
      for (const l of lines) net.set(l.componentCode, (net.get(l.componentCode) ?? D(0)).add(l.difference ?? 0));
      const owed = [...net.values()].some((x) => x.gt(0));
      let run: Prisma.PayrollRunGetPayload<object> | null = null;
      let payMonth = dto.payMonth ?? todayIst().slice(0, 7);
      if (dto.runId) {
        run = await tx.payrollRun.findFirst({ where: { organizationId: org, id: dto.runId, legalEntityId: w.legalEntityId, runType: 'offcycle', offcycleKind: { in: ['arrears', 'correction'] } } });
        if (!run || !EDITABLE.includes(run.status)) throw new ConflictException('Choose a draft arrears or correction off-cycle run of the same legal entity.');
        payMonth = dateOf(run.periodStart).slice(0, 7);
      } else if (owed) {
        const p = await tx.payPeriod.findFirst({ where: { organizationId: org, legalEntityId: w.legalEntityId, payGroupId: null, periodStart: asDate(`${payMonth}-01`) } });
        if (p?.lockedByRunId || p?.stage === 'filed') throw new ConflictException(`${payMonth} is already paid and locked; pay the arrears next month or in an off-cycle run.`);
      }
      const span = `${dateOf(w.fromMonth).slice(0, 7)}${w.toMonth.getTime() === w.fromMonth.getTime() ? '' : ` to ${dateOf(w.toMonth).slice(0, 7)}`}`;
      let overpaid = D(0);
      for (const [code, amount] of net) {
        if (amount.lt(0)) overpaid = overpaid.add(amount.neg());
        if (amount.lte(0)) continue;
        await tx.oneTimePay.create({
          data: {
            organizationId: org,
            legalEntityId: w.legalEntityId,
            employeeId: w.employeeId,
            employmentId: w.employmentId,
            componentCode: code,
            amount,
            periodStart: asDate(`${payMonth}-01`),
            source: 'arrears',
            sourceRef: w.id,
            reason: w.reason,
            label: `Arrears for ${span}.`,
            status: 'approved',
            runId: run?.id ?? null,
            createdBy: w.createdBy,
          },
        });
      }
      let recoveryId: string | null = null;
      if (overpaid.gt(0)) {
        const r = await tx.overpaymentRecovery.create({
          data: {
            organizationId: org,
            legalEntityId: w.legalEntityId,
            employeeId: w.employeeId,
            employmentId: w.employmentId,
            origin: 'arrears',
            originRef: w.id,
            originTaxYear: taxYearOf(dateOf(w.fromMonth).slice(0, 7)),
            amount: overpaid,
            instalment: overpaid,
            reason: `Overpaid for ${span}: ${w.reason}`.slice(0, 300),
            createdBy: w.createdBy,
          },
        });
        recoveryId = r.id;
      }
      await tx.arrearsWorksheet.update({
        where: { id: w.id },
        data: { status: 'approved', approvedBy: v.userId, approvedAt: new Date(), payMonth: asDate(`${payMonth}-01`), runId: run?.id ?? null, version: { increment: 1 } },
      });
      await audit(tx, c, 'payroll.arrears.worksheet_approved', 'arrears_worksheet', w.id, { total: w.total.toFixed(2), payMonth, runId: run?.id ?? null, overpaid: overpaid.toFixed(2), recoveryId });
      const userId = recoveryId ? (await tx.employee.findFirst({ where: { organizationId: org, id: w.employeeId }, select: { userId: true } }))?.userId : null;
      return { id: w.id, status: 'approved', payMonth, runId: run?.id ?? null, overpaid: overpaid.toFixed(2), recoveryId, notify: userId ?? null };
    });
    if (out.notify && out.recoveryId) await this.askConsent(ctx, out.notify, out.recoveryId);
    return { id: out.id, status: out.status, payMonth: out.payMonth, runId: out.runId, overpaid: out.overpaid, recoveryId: out.recoveryId };
  }

  async cancelWorksheet(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const w = await this.sheetIn(tx, c, v, id);
      if (w.status !== 'draft') throw new ConflictException('Only a draft worksheet is cancelled.');
      await tx.arrearsWorksheet.update({ where: { id: w.id }, data: { status: 'cancelled', version: { increment: 1 } } });
      await audit(tx, c, 'payroll.arrears.worksheet_cancelled', 'arrears_worksheet', w.id, {});
      return { id: w.id, status: 'cancelled' };
    });
  }

  // ------------------------------------------------------------------------------------------ rule-change proposals (PAY-7.03)

  /** Finds approved payslips whose rules are no longer the ones in force for their month (refreshes open proposals). */
  private async refresh(tx: Tx, org: string, entityIds: string[]) {
    const rules = await this.rules.published();
    const since = asDate(`${Number(todayIst().slice(0, 4)) - 3}-04-01`);
    for (const entity of entityIds) {
      const slips = await tx.payslip.findMany({
        where: { organizationId: org, legalEntityId: entity, status: 'approved', runType: 'regular', periodStart: { gte: since } },
        select: { employeeId: true, periodStart: true, ruleVersions: true },
      });
      for (const x of staleRuleUses(
        slips.map((s) => ({ employeeId: s.employeeId, month: dateOf(s.periodStart).slice(0, 7), ruleVersions: (s.ruleVersions as Record<string, string>) ?? {} })),
        rules,
      )) {
        const data = { periods: x.periods, employees: x.employees, employeeCount: x.employees.length };
        const old = await tx.statutoryArrearsProposal.findFirst({ where: { organizationId: org, legalEntityId: entity, statute: x.statute, jurisdiction: x.jurisdiction, ruleVersion: x.version } });
        if (!old) await tx.statutoryArrearsProposal.create({ data: { organizationId: org, legalEntityId: entity, statute: x.statute, jurisdiction: x.jurisdiction, ruleVersion: x.version, ...data } });
        else if (old.status === 'open') await tx.statutoryArrearsProposal.update({ where: { id: old.id }, data });
      }
    }
  }

  private proposalView(p: Prisma.StatutoryArrearsProposalGetPayload<object>) {
    return {
      id: p.id,
      legalEntityId: p.legalEntityId,
      statute: p.statute,
      jurisdiction: p.jurisdiction,
      ruleVersion: p.ruleVersion,
      periods: p.periods,
      employeeCount: p.employeeCount,
      status: p.status,
      reason: p.reason,
      decidedBy: p.decidedBy,
    };
  }

  async proposals(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = await this.scoped(tx, c, v, ['payroll.arrears.approve']);
      await this.refresh(tx, c.organizationId, ids);
      const rows = await tx.statutoryArrearsProposal.findMany({ where: { organizationId: c.organizationId, legalEntityId: { in: ids } }, orderBy: { createdAt: 'desc' }, take: 100 });
      return rows.map((p) => this.proposalView(p));
    });
  }

  private async proposalIn(tx: Tx, c: CompanyContext, v: Viewer, id: string) {
    const ids = await this.scoped(tx, c, v, ['payroll.arrears.approve']);
    await lock(tx, `proposal:${id}`);
    const p = await tx.statutoryArrearsProposal.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!p || !ids.includes(p.legalEntityId)) throw new NotFoundException('Not found');
    if (p.status !== 'open') throw new ConflictException(`This proposal is already ${p.status}.`);
    return p;
  }

  /** Accept: a worksheet for each person over the months touched (each still approved by someone else). */
  async accept(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(
      this.tenantPrisma,
      ctx,
      async (tx, c) => {
        const p = await this.proposalIn(tx, c, v, id);
        const periods = (p.periods as string[]).sort();
        const sheets: string[] = [];
        for (const employeeId of p.employees as string[]) {
          const em = await this.employment(tx, c.organizationId, employeeId, [p.legalEntityId]);
          sheets.push(
            (await this.worksheetIn(tx, c, v.userId!, em, periods[0], periods[periods.length - 1], 'rule', p.id, `${p.statute} ${p.jurisdiction} rules ${p.ruleVersion} apply to months already paid`))
              .id,
          );
        }
        await tx.statutoryArrearsProposal.update({ where: { id: p.id }, data: { status: 'accepted', decidedBy: v.userId, decidedAt: new Date() } });
        await audit(tx, c, 'payroll.arrears.proposal_accepted', 'statutory_arrears_proposal', p.id, { statute: p.statute, ruleVersion: p.ruleVersion, worksheets: sheets.length });
        return { id: p.id, status: 'accepted', worksheets: sheets };
      },
      { timeout: 120_000 },
    );
  }

  async dismiss(ctx: TenantContext, user: ScopeUser, id: string, reason: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const p = await this.proposalIn(tx, c, v, id);
      await tx.statutoryArrearsProposal.update({ where: { id: p.id }, data: { status: 'dismissed', reason, decidedBy: v.userId, decidedAt: new Date() } });
      await audit(tx, c, 'payroll.arrears.proposal_dismissed', 'statutory_arrears_proposal', p.id, { statute: p.statute, ruleVersion: p.ruleVersion, reason });
      return { id: p.id, status: 'dismissed' };
    });
  }

  // ------------------------------------------------------------------------------------------ overpayments (PAY-7.07)

  private recoveryView(r: Prisma.OverpaymentRecoveryGetPayload<object>) {
    const ty = taxYearOf(todayIst().slice(0, 7));
    return {
      id: r.id,
      employeeId: r.employeeId,
      origin: r.origin,
      originRef: r.originRef,
      originTaxYear: r.originTaxYear,
      // Overpaid in an earlier tax year: the recovery does not reduce this year's taxable pay (tax handled by hand).
      crossYear: r.originTaxYear !== ty,
      amount: r.amount.toFixed(2),
      recovered: r.recovered.toFixed(2),
      writtenOff: r.writtenOff.toFixed(2),
      balance: r.amount.sub(r.recovered).sub(r.writtenOff).toFixed(2),
      instalment: r.instalment.toFixed(2),
      reason: r.reason,
      status: r.status,
      consentAt: r.consentAt,
      writeOffReason: r.writeOffReason,
    };
  }

  private async askConsent(ctx: TenantContext, userId: string, id: string) {
    await this.notifications
      .notifySystem(
        ctx,
        [userId],
        'payroll.overpayment.consent',
        { entityType: 'overpayment_recovery', entityId: id, contextText: 'Payroll asks you to agree to a repayment plan', linkPath: '/yx/me/pay' },
        { subject: 'Please review a repayment plan', html: '<p>Payroll found that you were paid more than due and proposes a repayment plan. Open YukthiX to agree or decline.</p>' },
      )
      .catch(() => undefined);
  }

  async createRecovery(ctx: TenantContext, user: ScopeUser, dto: OverpaymentDto) {
    const v = await this.viewer(user);
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = await this.scoped(tx, c, v, ['payroll.arrears.approve']);
      const em = await this.employment(tx, c.organizationId, dto.employeeId, ids);
      if (D(dto.instalment).gt(dto.amount)) throw new BadRequestException('The instalment is more than the amount.');
      const r = await tx.overpaymentRecovery.create({
        data: {
          organizationId: c.organizationId,
          legalEntityId: em.legalEntityId,
          employeeId: em.employeeId,
          employmentId: em.id,
          origin: 'manual',
          originTaxYear: dto.taxYear ?? taxYearOf(todayIst().slice(0, 7)),
          amount: dto.amount,
          instalment: dto.instalment,
          reason: dto.reason,
          createdBy: v.userId!,
        },
      });
      await audit(tx, c, 'payroll.overpayment.raised', 'overpayment_recovery', r.id, { employeeId: em.employeeId, amount: dto.amount, instalment: dto.instalment, reason: dto.reason });
      const userId = (await tx.employee.findFirst({ where: { organizationId: c.organizationId, id: em.employeeId }, select: { userId: true } }))?.userId ?? null;
      return { view: this.recoveryView(r), userId };
    });
    if (out.userId) await this.askConsent(ctx, out.userId, out.view.id);
    return out.view;
  }

  async recoveries(ctx: TenantContext, user: ScopeUser, crossYear: boolean) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = await this.scoped(tx, c, v, ['payroll.arrears.approve', 'payroll.writeoff.approve']);
      const rows = await tx.overpaymentRecovery.findMany({
        where: { organizationId: c.organizationId, legalEntityId: { in: ids }, ...(crossYear ? { originTaxYear: { not: taxYearOf(todayIst().slice(0, 7)) } } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 500,
      });
      return rows.map((r) => this.recoveryView(r));
    });
  }

  /** The employee's own recovery plans (no key: their own rows only, by the pay guard). */
  async mine(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const mine = (await tx.employee.findMany({ where: { organizationId: c.organizationId, userId: v.userId! }, select: { id: true } })).map((e) => e.id);
      const rows = await tx.overpaymentRecovery.findMany({ where: { organizationId: c.organizationId, employeeId: { in: mine } }, orderBy: { createdAt: 'desc' } });
      return rows.map((r) => this.recoveryView(r));
    });
  }

  /** The employee agrees (recovery starts with the next payroll) or declines (payroll follows up by hand). */
  async answer(ctx: TenantContext, user: ScopeUser, id: string, agree: boolean) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const mine = (await tx.employee.findMany({ where: { organizationId: c.organizationId, userId: v.userId! }, select: { id: true } })).map((e) => e.id);
      await lock(tx, `overpayment:${id}`);
      const r = await tx.overpaymentRecovery.findFirst({ where: { organizationId: c.organizationId, id, employeeId: { in: mine } } });
      if (!r) throw new NotFoundException('Not found');
      if (r.status !== 'proposed') throw new ConflictException('You have already answered.');
      const done = await tx.overpaymentRecovery.update({
        where: { id: r.id },
        data: agree ? { status: 'active', consentAt: new Date(), consentBy: v.userId, version: { increment: 1 } } : { status: 'declined', declinedAt: new Date(), version: { increment: 1 } },
      });
      await audit(tx, c, agree ? 'payroll.overpayment.consented' : 'payroll.overpayment.declined', 'overpayment_recovery', r.id, { employeeId: r.employeeId });
      return this.recoveryView(done);
    });
  }

  /** The rest is written off by someone other than who raised it (step-up by the route), with a reason. */
  async writeOff(ctx: TenantContext, user: ScopeUser, id: string, reason: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = await this.scoped(tx, c, v, ['payroll.writeoff.approve']);
      await lock(tx, `overpayment:${id}`);
      const r = await tx.overpaymentRecovery.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!r || !ids.includes(r.legalEntityId)) throw new NotFoundException('Not found');
      if (!['proposed', 'active', 'declined'].includes(r.status)) throw new ConflictException(`A ${r.status} recovery has nothing left to write off.`);
      if (r.createdBy === v.userId) throw new ForbiddenException('Someone other than the person who raised the recovery writes it off.');
      const left = r.amount.sub(r.recovered).sub(r.writtenOff);
      const done = await tx.overpaymentRecovery.update({
        where: { id: r.id },
        data: { writtenOff: r.writtenOff.add(left), status: 'written_off', writeOffBy: v.userId, writeOffAt: new Date(), writeOffReason: reason, version: { increment: 1 } },
      });
      await audit(tx, c, 'payroll.overpayment.written_off', 'overpayment_recovery', r.id, { amount: left.toFixed(2), reason, crossYear: r.originTaxYear !== taxYearOf(todayIst().slice(0, 7)) });
      return this.recoveryView(done);
    });
  }
}
