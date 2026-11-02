import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrgSecretsCryptoService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import type { ScopeUser, Viewer } from '../access/scope';
import { asDate, dateOf, monthRange } from '../time/time-core';
import { ApprovalsEngine, type Notice } from '../workflow/approvals-engine.service';
import { CourtOrderDto, HoldDto, HoldReleaseDto, LoanChangeDto, LoanRequestDto, LopRowDto, OneTimeDto, SpecialDaysDto } from './dto-5c';
import { PayKey, entitiesFor, payHolders, payScope, payViewer, requireEntity, requireSelf, withPayScope } from './pay-access';
import { inr, payOn } from './fnf.service';
import { closingInterest, dayMonYear, interestFrom, loanRoom, loanSchedule, maxMonthsOf } from './loan-rules';

// Payroll inputs and recoveries (M03-BUILD-DESIGN §10, PAY-3.02, 3.11 … 3.14, 3.17): manual LOP for assumed-present
// groups (D1), one-time pay (above a company amount it is approved through P03), special days, holds (idempotent release,
// ageing), loans and salary advances (P03 request, EMIs within the protected net; schedule changes audited), court orders
// (payee encrypted), the journal export and employee cost rates. Each checks the key's legal entity and the pay guard.

export const ONE_TIME = 'payroll.one_time';
export const LOAN = 'payroll.loan';
const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);

/** The monthly instalment: principal ÷ months when interest-free, else the equal instalment at the yearly rate. */
export function loanEmi(principal: Prisma.Decimal, yearlyRatePct: Prisma.Decimal, months: number): Prisma.Decimal {
  if (yearlyRatePct.isZero()) return principal.div(months).toDecimalPlaces(0, Prisma.Decimal.ROUND_UP);
  const r = yearlyRatePct.div(1200);
  const f = r.add(1).pow(months);
  return principal.mul(r).mul(f).div(f.sub(1)).toDecimalPlaces(0, Prisma.Decimal.ROUND_UP);
}

/** What an instalment repays of the principal (the month's interest on the balance comes first). */
export function principalPart(outstanding: Prisma.Decimal, yearlyRatePct: Prisma.Decimal, paid: Prisma.Decimal): Prisma.Decimal {
  const interest = outstanding.mul(yearlyRatePct).div(1200).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  return Prisma.Decimal.max(D(0), paid.sub(interest));
}

@Injectable()
export class PayInputsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly engine: ApprovalsEngine,
    private readonly crypto: OrgSecretsCryptoService,
  ) {}

  onModuleInit() {
    this.engine.register({ key: ONE_TIME, label: 'One-time pay', risk: 'normal', autoActions: false, distinctSteps: true, onDecided: (tx, req, o) => this.oneTimeDecided(tx, req, o), requesterLink: () => '/yx/payroll/one-time-pay' });
    this.engine.register({ key: LOAN, label: 'Loan or salary advance', risk: 'normal', autoActions: false, distinctSteps: true, onDecided: (tx, req, o) => this.loanDecided(tx, req, o), requesterLink: () => '/yx/me/loans' });
  }

  private async viewer(user: ScopeUser) {
    const v = await payViewer(this.prisma, this.tenantPrisma, user);
    requireSelf(v);
    return v;
  }

  /** The person's employment in a legal entity this key reaches (else "not found"), with the pay guard opened to it. */
  private async person(tx: Tx, c: CompanyContext, v: Viewer, key: PayKey, employeeId: string, on: string) {
    const e = await tx.employment.findFirst({ where: { organizationId: c.organizationId, employeeId, joinedOn: { lte: asDate(on) }, OR: [{ exitedOn: null }, { exitedOn: { gte: asDate(on.slice(0, 8) + '01') } }] }, orderBy: { joinedOn: 'desc' } });
    if (!e) throw new NotFoundException('Not found');
    await requireEntity(tx, c, v, key, e.legalEntityId);
    if (await this.isSelf(tx, c.organizationId, v, employeeId)) throw new ForbiddenException('Someone else enters pay inputs and holds about you.');
    await payScope(tx, [e.legalEntityId]);
    return e;
  }

  private async isSelf(tx: Tx, org: string, v: Viewer, employeeId: string) {
    return !!(await tx.employee.findFirst({ where: { organizationId: org, id: employeeId, userId: v.userId! }, select: { id: true } }));
  }

  /** Approvers for a request about a person: holders of the key, never the requester and never the person themselves. */
  private async approversFor(tx: Tx, org: string, key: PayKey, entityId: string, requester: string, employeeId: string) {
    const subject = (await tx.employee.findFirst({ where: { organizationId: org, id: employeeId }, select: { userId: true } }))?.userId;
    return (await payHolders(tx, org, key, entityId, todayIst())).filter((u) => u !== requester && u !== subject);
  }

  private async notLocked(tx: Tx, org: string, entityId: string, month: string) {
    const p = await tx.payPeriod.findFirst({ where: { organizationId: org, legalEntityId: entityId, payGroupId: null, periodStart: asDate(`${month}-01`) } });
    if (p && (p.stage === 'locked' || p.stage === 'filed')) throw new ConflictException({ statusCode: 409, code: 'PERIOD_LOCKED', message: `${month} is locked: record it as a correction for the next payroll.` });
  }

  // ------------------------------------------------------------------------------------------ manual LOP (D1)

  async lop(ctx: TenantContext, user: ScopeUser, month: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = await entitiesFor(tx, c, v, 'payroll.input.manage');
      await payScope(tx, ids);
      const rows = await tx.lopInput.findMany({ where: { organizationId: c.organizationId, legalEntityId: { in: ids }, periodStart: asDate(`${month}-01`) } });
      return rows.map((r) => ({ employeeId: r.employeeId, lopDays: r.lopDays.toFixed(2), reason: r.reason, source: r.source, enteredAt: r.enteredAt }));
    });
  }

  /** Saves LOP rows for a month (each row checked; a CSV upload sends the same rows with source "upload"). */
  async saveLop(ctx: TenantContext, user: ScopeUser, month: string, rows: LopRowDto[], source: 'manual' | 'upload' = 'manual', periodStart?: string) {
    const v = await this.viewer(user);
    if (periodStart && periodStart.slice(0, 7) !== month) throw new BadRequestException('The pay period starts in this month.');
    const key = asDate(periodStart ?? `${month}-01`);
    const days = Number(monthRange(month).to.slice(8));
    const bad = rows.map((r, i) => (D(r.lopDays).gt(days) ? `Row ${i + 1}: more than ${days} days.` : null)).filter(Boolean);
    if (bad.length) throw new BadRequestException({ statusCode: 400, code: 'LOP_ROWS', message: bad.join(' '), rows: bad });
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      for (const r of rows) {
        const e = await this.person(tx, c, v, 'payroll.input.manage', r.employeeId, monthRange(month).to);
        await this.notLocked(tx, c.organizationId, e.legalEntityId, month);
        await tx.lopInput.upsert({ where: { organizationId_employmentId_periodStart: { organizationId: c.organizationId, employmentId: e.id, periodStart: key } }, update: { lopDays: r.lopDays, reason: r.reason, source, enteredBy: v.userId!, enteredAt: new Date() }, create: { organizationId: c.organizationId, legalEntityId: e.legalEntityId, employeeId: e.employeeId, employmentId: e.id, periodStart: key, lopDays: r.lopDays, reason: r.reason, source, enteredBy: v.userId! } });
      }
      await audit(tx, c, 'payroll.lop.saved', 'payroll_input', month, { rows: rows.length, source });
      return { saved: rows.length };
    });
  }

  // ------------------------------------------------------------------------------------------ one-time pay (§10.2)

  async oneTimeList(ctx: TenantContext, user: ScopeUser, month?: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = await entitiesFor(tx, c, v, 'payroll.input.manage');
      await payScope(tx, ids);
      const rows = await tx.oneTimePay.findMany({ where: { organizationId: c.organizationId, legalEntityId: { in: ids }, ...(month ? { periodStart: asDate(`${month}-01`) } : {}) }, orderBy: { createdAt: 'desc' }, take: 500 });
      return rows.map((r) => ({ id: r.id, employeeId: r.employeeId, componentCode: r.componentCode, amount: r.amount.toFixed(2), month: dateOf(r.periodStart).slice(0, 7), endOn: r.endOn ? dateOf(r.endOn) : null, source: r.source, reason: r.reason, status: r.status }));
    });
  }

  async addOneTime(ctx: TenantContext, user: ScopeUser, dto: OneTimeDto) {
    const v = await this.viewer(user);
    const notices: Notice[] = [];
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const e = await this.person(tx, c, v, 'payroll.input.manage', dto.employeeId, monthRange(dto.month).to);
      await this.notLocked(tx, org, e.legalEntityId, dto.month);
      const comp = await tx.payComponent.findFirst({ where: { organizationId: org, code: dto.componentCode, status: 'active' } });
      if (!comp || comp.statutory || !['earning', 'deduction', 'reimbursement'].includes(comp.kind)) throw new BadRequestException('Choose an earning, deduction or reimbursement component (not a statutory one).');
      const row = await tx.oneTimePay.create({ data: { organizationId: org, legalEntityId: e.legalEntityId, employeeId: e.employeeId, employmentId: e.id, componentCode: comp.code, amount: dto.amount, periodStart: asDate(`${dto.month}-01`), endOn: dto.endOn ? asDate(dto.endOn) : null, reason: dto.reason, status: 'draft', createdBy: v.userId! } });
      // PAY-05: a draft waits in the list until it is sent for approval (one by one or in bulk); nothing is paid from it.
      if (dto.draft) {
        await audit(tx, c, 'payroll.one_time.drafted', 'one_time_pay', row.id, { employeeId: e.employeeId, componentCode: comp.code, month: dto.month });
        return { id: row.id, status: 'draft' };
      }
      return { id: row.id, status: await this.sendOneTime(tx, c, v, row, comp.name, notices) };
    });
    await this.engine.send(ctx, notices);
    return out;
  }

  /** A draft goes in: approved at once, or above the company's limit to someone else for approval. */
  private async sendOneTime(tx: Tx, c: CompanyContext, v: Viewer, row: Prisma.OneTimePayGetPayload<object>, componentName: string, notices: Notice[]) {
    const org = c.organizationId;
    const month = dateOf(row.periodStart).slice(0, 7);
    const amount = row.amount.toFixed(2);
    const limit = await settingFor(tx, c, 'payroll.one_time_review_above', { legalEntityId: row.legalEntityId });
    const review = limit !== 'none' && row.amount.gt(limit);
    await tx.oneTimePay.update({ where: { id: row.id }, data: { status: review ? 'pending' : 'approved' } });
    if (review) {
      const approvers = await this.approversFor(tx, org, 'payroll.run.approve', row.legalEntityId, v.userId!, row.employeeId);
      if (!approvers.length) throw new BadRequestException(`One-time pay above ₹${limit} needs someone else to approve it. Give a second person "payroll.run.approve".`);
      const sub = await this.engine.submit(tx, c, { type: ONE_TIME, subjectType: 'one_time_pay', subjectId: row.id, title: `One-time pay of ₹${amount}`, summary: [{ label: 'Component', value: componentName }, { label: 'Month', value: month }, { label: 'Why', value: row.reason.slice(0, 200) }], subjectPersonId: null, requesterUserId: v.userId!, raisedByUserId: v.userId!, steps: [{ name: 'Payroll approval', approvers: [{ kind: 'users', userIds: approvers }], mode: 'any', remindAfterHours: 24 }], payload: {}, payloadFields: [], fallbackUserIds: [] });
      notices.push(...sub.notices);
      await tx.oneTimePay.update({ where: { id: row.id }, data: { wfRequestId: sub.id } });
    }
    await audit(tx, c, 'payroll.one_time.added', 'one_time_pay', row.id, { employeeId: row.employeeId, componentCode: row.componentCode, month, review });
    return review ? 'pending' : 'approved';
  }

  /**
   * PAY-05 bulk actions on drafts: send them for approval, or delete them (kept as cancelled for the audit trail). All or
   * nothing: a chosen item that is not one's draft in scope, or in a locked month, stops the whole action.
   */
  async bulkOneTime(ctx: TenantContext, user: ScopeUser, ids: string[], action: 'submit' | 'delete') {
    const v = await this.viewer(user);
    const notices: Notice[] = [];
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const scope = await entitiesFor(tx, c, v, 'payroll.input.manage');
      await payScope(tx, scope);
      await tx.$queryRaw`SELECT id FROM one_time_pays WHERE organization_id = ${org}::uuid AND id = ANY(${ids}::uuid[]) FOR UPDATE`;
      const rows = await tx.oneTimePay.findMany({ where: { organizationId: org, id: { in: ids }, legalEntityId: { in: scope } } });
      if (rows.length !== new Set(ids).size) throw new NotFoundException('Not found');
      const notDraft = rows.filter((r) => r.status !== 'draft');
      if (notDraft.length) throw new ConflictException({ statusCode: 409, code: 'NOT_DRAFT', message: `${notDraft.length} of the chosen items ${notDraft.length === 1 ? 'is' : 'are'} not a draft any more (someone sent or deleted ${notDraft.length === 1 ? 'it' : 'them'}). Reload and choose again.` });
      for (const r of rows) {
        if (await this.isSelf(tx, org, v, r.employeeId)) throw new ForbiddenException('Someone else enters pay inputs and holds about you.');
        await this.notLocked(tx, org, r.legalEntityId, dateOf(r.periodStart).slice(0, 7));
      }
      const names = new Map((await tx.payComponent.findMany({ where: { organizationId: org, code: { in: rows.map((r) => r.componentCode) } }, select: { code: true, name: true } })).map((x) => [x.code, x.name]));
      const out: { id: string; status: string }[] = [];
      for (const r of rows) {
        if (action === 'delete') {
          await tx.oneTimePay.update({ where: { id: r.id }, data: { status: 'cancelled' } });
          await audit(tx, c, 'payroll.one_time.draft_deleted', 'one_time_pay', r.id, { employeeId: r.employeeId });
          out.push({ id: r.id, status: 'cancelled' });
        } else out.push({ id: r.id, status: await this.sendOneTime(tx, c, v, r, names.get(r.componentCode) ?? r.componentCode, notices) });
      }
      return { action, items: out };
    });
    await this.engine.send(ctx, notices);
    return out;
  }

  async cancelOneTime(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await payScope(tx, await entitiesFor(tx, c, v, 'payroll.input.manage'));
      const row = await tx.oneTimePay.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!row) throw new NotFoundException('Not found');
      await this.notLocked(tx, c.organizationId, row.legalEntityId, dateOf(row.periodStart).slice(0, 7));
      if (row.status === 'cancelled') return { id, status: 'cancelled' };
      await tx.oneTimePay.update({ where: { id }, data: { status: 'cancelled' } });
      await audit(tx, c, 'payroll.one_time.cancelled', 'one_time_pay', id, {});
      return { id, status: 'cancelled' };
    });
  }

  private async oneTimeDecided(tx: Tx, wf: Prisma.WfRequestGetPayload<object>, outcome: 'approved' | 'rejected') {
    const entity = await tx.$queryRaw<{ id: string }[]>`SELECT legal_entity_id::text AS id FROM legal_entities WHERE organization_id = ${wf.organizationId}::uuid`;
    await payScope(tx, entity.map((x) => x.id));
    await tx.oneTimePay.updateMany({ where: { organizationId: wf.organizationId, id: wf.subjectId, status: 'pending' }, data: { status: outcome } });
    await payScope(tx, []);
  }

  // ------------------------------------------------------------------------------------------ special days (PAY-3.13 / 3.14)

  async saveSpecialDays(ctx: TenantContext, user: ScopeUser, dto: SpecialDaysDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const e = await this.person(tx, c, v, 'payroll.input.manage', dto.employeeId, monthRange(dto.month).to);
      await this.notLocked(tx, c.organizationId, e.legalEntityId, dto.month);
      await tx.specialDays.upsert({ where: { organizationId_employmentId_periodStart_kind: { organizationId: c.organizationId, employmentId: e.id, periodStart: asDate(`${dto.month}-01`), kind: dto.kind } }, update: { days: dto.days, daysBefore: dto.daysBefore ?? 0, note: dto.note, enteredBy: v.userId!, enteredAt: new Date() }, create: { organizationId: c.organizationId, legalEntityId: e.legalEntityId, employeeId: e.employeeId, employmentId: e.id, periodStart: asDate(`${dto.month}-01`), kind: dto.kind, days: dto.days, daysBefore: dto.daysBefore ?? 0, note: dto.note, enteredBy: v.userId! } });
      await audit(tx, c, 'payroll.special_days.saved', 'employee', e.employeeId, { month: dto.month, kind: dto.kind, days: dto.days });
      return { saved: true };
    });
  }

  // ------------------------------------------------------------------------------------------ holds (PAY-3.11)

  async holds(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = await entitiesFor(tx, c, v, 'payroll.hold.manage');
      await payScope(tx, ids);
      const rows = await tx.payrollWithhold.findMany({ where: { organizationId: c.organizationId, legalEntityId: { in: ids } }, orderBy: { createdAt: 'desc' }, take: 500 });
      const today = Date.parse(`${todayIst()}T00:00:00Z`);
      return rows.map((r) => ({ id: r.id, employeeId: r.employeeId, reasonCode: r.reasonCode, trigger: r.trigger, note: r.note, amount: r.amount?.toFixed(2) ?? null, heldRunId: r.heldRunId, released: !!r.releasedAt, releasedAt: r.releasedAt, ageDays: r.releasedAt ? null : Math.floor((today - r.createdAt.getTime()) / 86_400_000) }));
    });
  }

  /** Adds a hold, or returns the person's open one (one open hold at a time). */
  async addHold(ctx: TenantContext, user: ScopeUser, dto: HoldDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const e = await this.person(tx, c, v, 'payroll.hold.manage', dto.employeeId, todayIst());
      const open = await tx.payrollWithhold.findFirst({ where: { organizationId: c.organizationId, employmentId: e.id, releasedAt: null } });
      if (open) return { id: open.id, created: false };
      const h = await tx.payrollWithhold.create({ data: { organizationId: c.organizationId, legalEntityId: e.legalEntityId, employeeId: e.employeeId, employmentId: e.id, reasonCode: dto.reasonCode, note: dto.note, createdBy: v.userId } });
      await audit(tx, c, 'payroll.hold.added', 'employee', e.employeeId, { holdId: h.id, reasonCode: dto.reasonCode });
      return { id: h.id, created: true };
    });
  }

  /** Releases a hold with a reason (founder 29 Oct 2026; kept in the audit trail) and a route. Idempotent: a second
   * release changes nothing. The payslips held while it was open become payable again: `next_bank_file` goes into the
   * bank file of the entity's next regular run, not its own run's (founder 30 Oct 2026, item 10; the hold keeps no run
   * until that file claims it, see PayoutService.routed); `offcycle` is paid now by an off-cycle bank file from its own
   * run (so it needs a held payslip in an approved run). A hold with nothing held yet simply stops holding the next run. */
  async releaseHold(ctx: TenantContext, user: ScopeUser, id: string, dto: HoldReleaseDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      await payScope(tx, await entitiesFor(tx, c, v, 'payroll.hold.manage'));
      const h = await tx.payrollWithhold.findFirst({ where: { organizationId: org, id } });
      if (!h) throw new NotFoundException('Not found');
      if (await this.isSelf(tx, org, v, h.employeeId)) throw new ForbiddenException('Someone else releases a hold on your pay.');
      if (h.releasedAt) return { id, released: true, releasedAt: h.releasedAt, route: null, payslips: 0, runIds: [] as string[] };
      const slips = await tx.payslip.findMany({ where: { organizationId: org, employmentId: h.employmentId, status: 'approved', held: true, paymentStatus: 'held', approvedAt: { gte: h.createdAt } }, select: { id: true, runId: true, calcVersion: true, net: true } });
      // A payslip held because its bank account was missing (a waived check) stays held: this release is not about it.
      const noBank = await tx.runValidation.findMany({ where: { organizationId: org, employeeId: h.employeeId, checkKey: 'bank_missing', waivedBy: { not: null }, runId: { in: slips.map((x) => x.runId).filter((x): x is string => !!x) } }, select: { runId: true, calcVersion: true } });
      const held = slips.filter((x) => !noBank.some((b) => b.runId === x.runId && b.calcVersion === x.calcVersion));
      if (dto.route === 'offcycle' && !held.length) throw new BadRequestException('Nothing is held in an approved run yet. Release into the next bank file: the next run pays as usual.');
      const n = await tx.payrollWithhold.updateMany({ where: { id, releasedAt: null }, data: { releasedAt: new Date(), releasedBy: v.userId, releasedRunId: dto.route === 'offcycle' ? (held[0]?.runId ?? null) : null } });
      if (!n.count) return { id, released: true, releasedAt: (await tx.payrollWithhold.findFirstOrThrow({ where: { id } })).releasedAt, route: null, payslips: 0, runIds: [] as string[] };
      if (held.length) await tx.payslip.updateMany({ where: { organizationId: org, id: { in: held.map((x) => x.id) }, paymentStatus: 'held' }, data: { held: false, paymentStatus: 'pending' } });
      const runIds = [...new Set(held.map((x) => x.runId).filter((x): x is string => !!x))];
      const amount = held.reduce((t, x) => t.add(x.net), new Prisma.Decimal(0)).toFixed(2);
      await audit(tx, c, 'payroll.hold.released', 'employee', h.employeeId, { holdId: id, reason: dto.reason, route: dto.route, payslips: held.length, runIds, amount: held.length ? amount : (h.amount?.toFixed(2) ?? null) });
      const after = await tx.payrollWithhold.findFirstOrThrow({ where: { id } });
      return { id, released: true, releasedAt: after.releasedAt, route: dto.route, payslips: held.length, runIds };
    });
  }

  // ------------------------------------------------------------------------------------------ loans and advances (Q4)

  /**
   * Founder decision 8: who may ask (after probation unless the company allows everyone) and how much (months of gross
   * pay, less what the person still owes on open loans). Gross and loans are read with the pay guard opened to the
   * company's entities for this one server-side check (a transfer keeps the old entity's loan), then put back.
   */
  private async loanRules(tx: Tx, c: CompanyContext, e: Prisma.EmploymentGetPayload<object>, forSelf: boolean) {
    const org = c.organizationId;
    const today = todayIst();
    const lev = { legalEntityId: e.legalEntityId };
    const afterProbation = await settingFor(tx, c, 'payroll.loan.after_probation', lev);
    const months = maxMonthsOf(await settingFor(tx, c, 'payroll.loan.max_gross_months', lev));
    const status = await tx.employmentStatusPeriod.findFirst({
      where: { organizationId: org, employmentId: e.id, supersededAt: null, validFrom: { lte: asDate(today) }, OR: [{ validTo: null }, { validTo: { gte: asDate(today) } }] },
      orderBy: { validFrom: 'desc' },
    });
    const onProbation = status?.status === 'probation';
    const plan = onProbation ? await tx.probation.findFirst({ where: { organizationId: org, employmentId: e.id } }) : null;
    const probationEndsOn = plan ? dateOf(plan.plannedEndOn) : null;
    const all = (await tx.legalEntity.findMany({ where: { organizationId: org }, select: { id: true } })).map((x) => x.id);
    const { gross, outstanding } = await withPayScope(tx, all, async () => ({
      gross: (await payOn(tx, org, e.id, today)).gross,
      outstanding: (await tx.loan.aggregate({ where: { organizationId: org, employeeId: e.employeeId, status: { in: ['requested', 'active', 'paused'] } }, _sum: { outstanding: true } }))._sum.outstanding ?? D(0),
    }));
    const room = loanRoom(gross, months, outstanding);
    const interestRate = { advance: await settingFor(tx, c, 'payroll.loan.interest_rate.advance', lev), loan: await settingFor(tx, c, 'payroll.loan.interest_rate.loan', lev) };
    const name = forSelf ? '' : ((await tx.employee.findFirst({ where: { organizationId: org, id: e.employeeId }, select: { givenName: true } }))?.givenName ?? 'This person');
    let reason: string | null = null;
    let refusal: 'probation' | 'no_pay' | null = null;
    if (afterProbation === 'confirmed' && onProbation) {
      refusal = 'probation';
      const until = probationEndsOn ? dayMonYear(probationEndsOn) : null;
      reason = forSelf
        ? `You can ask for a loan or advance after your probation is confirmed.${until ? ` Your probation ends on ${until}.` : ''}`
        : `${name} is on probation${until ? ` until ${until}` : ''}. The company allows loans only after probation.`;
    } else if (months !== null && gross.isZero()) {
      refusal = 'no_pay';
      reason = forSelf ? "Your pay is not set up yet, so the loan limit can't be worked out. Ask HR." : `${name}'s pay is not set up yet, so the loan limit can't be worked out. Ask HR.`;
    }
    return { afterProbation, months, onProbation, probationEndsOn, gross, outstanding, ...room, interestRate, reason, refusal };
  }

  /** The signed-in person's own loan rules (GET /payroll/loans/rules): the same checks and words as a request. */
  async myLoanRules(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const me = await tx.employee.findFirst({ where: { organizationId: c.organizationId, userId: v.userId! }, select: { id: true } });
      if (!me) throw new ForbiddenException('Only employees request loans for themselves.');
      const e = await tx.employment.findFirst({ where: { organizationId: c.organizationId, employeeId: me.id, exitedOn: null }, orderBy: { joinedOn: 'desc' } });
      if (!e) throw new NotFoundException('Not found');
      const r = await this.loanRules(tx, c, e, true);
      return {
        eligible: !r.reason,
        reason: r.reason,
        probationEndsOn: r.onProbation ? r.probationEndsOn : null,
        monthlyGross: r.gross.isZero() ? null : r.gross.toFixed(2),
        maxGrossMonths: r.months,
        limit: r.limit?.toFixed(2) ?? null,
        outstanding: r.outstanding.toFixed(2),
        available: r.available?.toFixed(2) ?? null,
        interestRate: r.interestRate,
      };
    });
  }

  /** A request for oneself (implicit), or by payroll for someone in scope; approved by someone else through P03. */
  async requestLoan(ctx: TenantContext, user: ScopeUser, dto: LoanRequestDto) {
    // Founder answer 1: the company sets the rate per loan type; a rate sent by the client is refused, never used.
    if (dto.interestRate !== undefined) throw new BadRequestException('The interest rate is set by the company for each loan type. Send the request without it.');
    const v = await this.viewer(user);
    const notices: Notice[] = [];
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const me = await tx.employee.findFirst({ where: { organizationId: org, userId: v.userId! }, select: { id: true } });
      const forSelf = !dto.employeeId || dto.employeeId === me?.id;
      if (forSelf && !me) throw new ForbiddenException('Only employees request loans for themselves.');
      const employeeId = forSelf ? me!.id : dto.employeeId!;
      const on = `${dto.firstMonth}-01`;
      const e = await tx.employment.findFirst({ where: { organizationId: org, employeeId, exitedOn: null }, orderBy: { joinedOn: 'desc' } });
      if (!e) throw new NotFoundException('Not found');
      if (!forSelf) await requireEntity(tx, c, v, 'payroll.loan.manage', e.legalEntityId);
      const principal = D(dto.principal);
      const rule = await this.loanRules(tx, c, e, forSelf);
      if (rule.refusal === 'probation') throw new ForbiddenException(rule.reason);
      if (rule.refusal) throw new BadRequestException(rule.reason);
      if (rule.available && principal.gt(rule.available)) {
        const n = rule.months!;
        const owed = rule.outstanding.gt(0) ? `, less ${inr(rule.outstanding)} still to repay` : '';
        throw new BadRequestException(`The most you can ask for is ${inr(rule.available)}: ${n} ${n === 1 ? "month's" : "months'"} gross pay${owed}.`);
      }
      await payScope(tx, forSelf ? [] : [e.legalEntityId]);
      const rate = D(rule.interestRate[dto.loanType]);
      const emi = loanEmi(principal, rate, dto.instalments);
      const approvers = await this.approversFor(tx, org, 'payroll.loan.approve', e.legalEntityId, v.userId!, employeeId);
      if (!approvers.length) throw new BadRequestException('No one can approve this request yet. A payroll approver needs "payroll.loan.approve".');
      const [row] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO loans (organization_id, legal_entity_id, employee_id, employment_id, loan_type, principal, interest_rate, emi, first_month, outstanding, reason, requested_by)
        VALUES (${org}::uuid, ${e.legalEntityId}::uuid, ${employeeId}::uuid, ${e.id}::uuid, ${dto.loanType}, ${principal}, ${rate}, ${emi}, ${on}::date, ${principal}, ${dto.reason}, ${v.userId}::uuid) RETURNING id::text`;
      const sub = await this.engine.submit(tx, c, { type: LOAN, subjectType: 'loan', subjectId: row.id, title: `${dto.loanType === 'loan' ? 'Loan' : 'Salary advance'} of ₹${principal.toFixed(2)}`, summary: [{ label: 'Instalments', value: `${dto.instalments} of ₹${emi.toFixed(2)} from ${dto.firstMonth}` }, { label: 'Interest', value: rate.isZero() ? 'Interest-free' : `${rate.toString()}% a year (company rate)` }, { label: 'Why', value: dto.reason.slice(0, 200) }], subjectPersonId: null, requesterUserId: v.userId!, raisedByUserId: v.userId!, steps: [{ name: 'Payroll approval', approvers: [{ kind: 'users', userIds: approvers }], mode: 'any', remindAfterHours: 24 }], payload: {}, payloadFields: [], fallbackUserIds: [] });
      notices.push(...sub.notices);
      await tx.loan.update({ where: { id: row.id }, data: { wfRequestId: sub.id } });
      await audit(tx, c, 'payroll.loan.requested', 'loan', row.id, { employeeId, loanType: dto.loanType, instalments: dto.instalments, interestRate: rate.toFixed(2), forSelf, rule: { maxGrossMonths: rule.months, afterProbation: rule.afterProbation }, limit: rule.limit?.toFixed(2) ?? null, available: rule.available?.toFixed(2) ?? null });
      return { id: row.id, status: 'requested', emi: emi.toFixed(2) };
    });
    await this.engine.send(ctx, notices);
    return out;
  }

  private async loanDecided(tx: Tx, wf: Prisma.WfRequestGetPayload<object>, outcome: 'approved' | 'rejected') {
    const all = await tx.$queryRaw<{ id: string }[]>`SELECT id::text FROM legal_entities WHERE organization_id = ${wf.organizationId}::uuid`;
    await payScope(tx, all.map((x) => x.id));
    await tx.loan.updateMany({ where: { organizationId: wf.organizationId, id: wf.subjectId, status: 'requested' }, data: { status: outcome === 'approved' ? 'active' : 'rejected' } });
    await payScope(tx, []);
  }

  async loans(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = await entitiesFor(tx, c, v, 'payroll.loan.manage');
      await payScope(tx, ids);
      const me = await tx.employee.findFirst({ where: { organizationId: c.organizationId, userId: v.userId! }, select: { id: true } });
      const rows = await tx.loan.findMany({ where: { organizationId: c.organizationId, OR: [{ legalEntityId: { in: ids } }, ...(me ? [{ employeeId: me.id }] : [])] }, orderBy: { createdAt: 'desc' }, take: 500 });
      return rows.map((l) => ({ id: l.id, employeeId: l.employeeId, loanType: l.loanType, principal: l.principal.toFixed(2), interestRate: l.interestRate.toFixed(2), emi: l.emi.toFixed(2), outstanding: l.outstanding.toFixed(2), firstMonth: dateOf(l.firstMonth).slice(0, 7), status: l.status, pausedUntil: l.pausedUntil ? dateOf(l.pausedUntil).slice(0, 7) : null, mine: l.employeeId === me?.id }));
    });
  }

  /** What a loan's repayments and pre-closure come to (shared by the read and the pre-closure, so both agree). */
  private async loanMonths(tx: Tx, org: string, l: Prisma.LoanGetPayload<object>) {
    const paid = await tx.loanRepayment.findMany({ where: { organizationId: org, loanId: l.id }, orderBy: { createdAt: 'asc' }, select: { payslipId: true, amount: true } });
    const slips = await tx.payslip.findMany({ where: { organizationId: org, id: { in: paid.map((p) => p.payslipId) } }, select: { id: true, periodStart: true } });
    const repayments = paid.map((p) => ({ month: dateOf(slips.find((s) => s.id === p.payslipId)?.periodStart ?? l.firstMonth).slice(0, 7), amount: p.amount }));
    const open = ['active', 'paused'].includes(l.status);
    const rows = loanSchedule({
      principal: l.principal,
      ratePct: l.interestRate,
      emi: l.emi,
      outstanding: l.outstanding,
      firstMonth: dateOf(l.firstMonth).slice(0, 7),
      pausedUntil: l.pausedUntil ? dateOf(l.pausedUntil).slice(0, 7) : null,
      open,
      repayments,
    });
    const today = todayIst();
    const from = interestFrom(dateOf(l.firstMonth).slice(0, 7), repayments.length ? repayments.reduce((m, r) => (r.month > m ? r.month : m), repayments[0].month) : null);
    const close = closingInterest(l.outstanding, l.interestRate, from, today);
    return { rows, closing: open && l.outstanding.gt(0) ? { on: today, interestFrom: from, days: close.days, principal: l.outstanding, interest: close.interest, total: l.outstanding.add(close.interest) } : null };
  }

  /**
   * PAY-17 (founder answer 5): the loan's month by month: recovered (from the approved payslips) and scheduled (from the
   * balance), and what a pre-closure today comes to. The person's own loan, or payroll.loan.manage over its entity.
   */
  async loanRepayments(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = await entitiesFor(tx, c, v, 'payroll.loan.manage');
      await payScope(tx, ids);
      const me = await tx.employee.findFirst({ where: { organizationId: c.organizationId, userId: v.userId! }, select: { id: true } });
      const l = await tx.loan.findFirst({ where: { organizationId: c.organizationId, id, OR: [{ legalEntityId: { in: ids } }, ...(me ? [{ employeeId: me.id }] : [])] } });
      if (!l) throw new NotFoundException('Not found');
      const m = await this.loanMonths(tx, c.organizationId, l);
      const rec = m.rows.filter((r) => r.status === 'recovered');
      return {
        loanId: l.id,
        interestRate: l.interestRate.toFixed(2),
        recovered: rec.reduce((t, r) => t.add(r.emi), D(0)).toFixed(2),
        rows: m.rows,
        closing: m.closing && { on: m.closing.on, interestFrom: m.closing.interestFrom, days: m.closing.days, principal: m.closing.principal.toFixed(2), interest: m.closing.interest.toFixed(2), total: m.closing.total.toFixed(2) },
      };
    });
  }

  /** Pause, pre-close or reschedule by payroll, with a reason (audited; the outstanding balance goes to F&F on exit). */
  async changeLoan(ctx: TenantContext, user: ScopeUser, id: string, dto: LoanChangeDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await payScope(tx, await entitiesFor(tx, c, v, 'payroll.loan.manage'));
      const l = await tx.loan.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!l) throw new NotFoundException('Not found');
      if (await this.isSelf(tx, c.organizationId, v, l.employeeId)) throw new ForbiddenException('Someone else changes your own loan.');
      if (!['active', 'paused'].includes(l.status)) throw new ConflictException(`A ${l.status} loan is not changed.`);
      let data: Prisma.LoanUpdateInput;
      if (dto.kind === 'pause') {
        if (!dto.pauseUntil) throw new BadRequestException('Say until which month the instalments pause.');
        data = { status: 'active', pausedUntil: asDate(`${dto.pauseUntil}-01`) };
      } else if (dto.kind === 'reschedule') {
        if (!dto.emi || D(dto.emi).lte(0) || D(dto.emi).gt(l.outstanding)) throw new BadRequestException('Give a new instalment above zero and not more than the balance.');
        data = { emi: dto.emi };
      } else data = { status: 'closed', outstanding: 0 };
      // Pre-closure: the interest to today is worked out here (never taken from the client) and kept with the change.
      const closing = dto.kind === 'preclose' ? (await this.loanMonths(tx, c.organizationId, l)).closing : null;
      const settled = closing ? { interest: closing.interest.toFixed(2), interestFrom: closing.interestFrom, closedOn: closing.on, total: closing.total.toFixed(2) } : {};
      await tx.loan.update({ where: { id }, data });
      await tx.loanScheduleChange.create({ data: { organizationId: c.organizationId, legalEntityId: l.legalEntityId, employeeId: l.employeeId, loanId: id, kind: dto.kind, detail: { pauseUntil: dto.pauseUntil ?? null, emi: dto.emi ?? null, outstandingBefore: l.outstanding.toFixed(2), ...settled }, reason: dto.reason, changedBy: v.userId! } });
      await audit(tx, c, 'payroll.loan.changed', 'loan', id, { kind: dto.kind, reason: dto.reason, outstandingBefore: l.outstanding.toFixed(2), ...settled });
      return { id, kind: dto.kind, ...settled };
    });
  }

  // ------------------------------------------------------------------------------------------ court orders (YX-PAY-32)

  async courtOrders(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = await entitiesFor(tx, c, v, 'payroll.input.manage');
      await payScope(tx, ids);
      const rows = await tx.courtOrder.findMany({ where: { organizationId: c.organizationId, legalEntityId: { in: ids } }, orderBy: { priorityDate: 'asc' } });
      return rows.map((o) => ({ id: o.id, employeeId: o.employeeId, orderRef: o.orderRef, amount: o.amount?.toFixed(2) ?? null, percent: o.percent?.toFixed(2) ?? null, priorityDate: dateOf(o.priorityDate), capTotal: o.capTotal?.toFixed(2) ?? null, remittedTotal: o.remittedTotal.toFixed(2), status: o.status }));
    });
  }

  /**
   * PAY-19 "Court order record · remittances": each month's deduction for the order (approved payslips) and whether it
   * was paid to the court, with the reference.
   */
  async courtOrderRemittances(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const o = await this.orderIn(tx, c, v, id);
      return this.remittanceMonths(tx, c.organizationId, o.id);
    });
  }

  private async orderIn(tx: Tx, c: CompanyContext, v: Viewer, id: string) {
    const ids = await entitiesFor(tx, c, v, 'payroll.input.manage');
    await payScope(tx, ids);
    const o = await tx.courtOrder.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!o || !ids.includes(o.legalEntityId)) throw new NotFoundException('Not found');
    return o;
  }

  private async remittanceMonths(tx: Tx, org: string, orderId: string) {
    const lines = await tx.$queryRaw<{ month: string; amount: string }[]>`
      SELECT to_char(p.period_start, 'YYYY-MM') AS month, sum(l.amount)::text AS amount
      FROM payslip_lines l JOIN payslips p ON p.organization_id = l.organization_id AND p.id = l.payslip_id
      WHERE l.organization_id = ${org}::uuid AND l.component_code = 'court_attachment' AND l.source_ref = ${orderId} AND p.status = 'approved' AND l.amount > 0
      GROUP BY 1 ORDER BY 1`;
    const paid = await tx.courtOrderRemittance.findMany({ where: { organizationId: org, courtOrderId: orderId } });
    return lines.map((l) => {
      const r = paid.find((x) => dateOf(x.month).slice(0, 7) === l.month);
      return { month: l.month, deducted: D(l.amount).toFixed(2), remitted: r ? { reference: r.reference, at: r.recordedAt, by: r.recordedBy } : null };
    });
  }

  /** PAY-19: the month's deduction paid to the court, once, with the bank or challan reference (audited). */
  async recordRemittance(ctx: TenantContext, user: ScopeUser, id: string, month: string, reference: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const o = await this.orderIn(tx, c, v, id);
      if (await this.isSelf(tx, c.organizationId, v, o.employeeId)) throw new ForbiddenException('Someone else records payments about your own pay.');
      const due = (await this.remittanceMonths(tx, c.organizationId, o.id)).find((m) => m.month === month);
      if (!due) throw new BadRequestException(`Nothing was deducted for this order in ${month}: there is nothing to remit.`);
      if (due.remitted) throw new ConflictException(`${month} is already recorded as remitted (reference ${due.remitted.reference}).`);
      const r = await tx.courtOrderRemittance.create({ data: { organizationId: c.organizationId, legalEntityId: o.legalEntityId, employeeId: o.employeeId, courtOrderId: o.id, month: asDate(`${month}-01`), amount: due.deducted, reference, recordedBy: v.userId! } });
      await audit(tx, c, 'payroll.court_order.remitted', 'court_order', o.id, { month, amount: due.deducted, reference });
      return { id: r.id, month, amount: due.deducted, reference };
    });
  }

  /** PAY-19 "Carry-forwards": negative net carried to later runs, with what is recovered and what is left. */
  async carryForwards(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = await entitiesFor(tx, c, v, 'payroll.input.manage');
      await payScope(tx, ids);
      const rows = await tx.payCarryForward.findMany({ where: { organizationId: c.organizationId, legalEntityId: { in: ids } }, orderBy: { createdAt: 'desc' }, take: 500 });
      const origins = new Map((await tx.payslip.findMany({ where: { organizationId: c.organizationId, id: { in: rows.map((r) => r.originPayslipId) } }, select: { id: true, periodStart: true } })).map((p) => [p.id, dateOf(p.periodStart).slice(0, 7)]));
      return rows.map((r) => ({ id: r.id, employeeId: r.employeeId, originMonth: origins.get(r.originPayslipId) ?? null, amount: r.amount.toFixed(2), recovered: r.recovered.toFixed(2), balance: r.amount.sub(r.recovered).toFixed(2), status: r.status }));
    });
  }

  async addCourtOrder(ctx: TenantContext, user: ScopeUser, dto: CourtOrderDto) {
    if ((dto.amount === undefined) === (dto.percent === undefined)) throw new BadRequestException('Give either a fixed amount or a percentage.');
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const e = await this.person(tx, c, v, 'payroll.input.manage', dto.employeeId, todayIst());
      const o = await tx.courtOrder.create({ data: { organizationId: c.organizationId, legalEntityId: e.legalEntityId, employeeId: e.employeeId, employmentId: e.id, orderRef: dto.orderRef, amount: dto.amount ?? null, percent: dto.percent ?? null, priorityDate: asDate(dto.priorityDate), payeeEnc: this.crypto.encrypt(dto.payee), capTotal: dto.capTotal ?? null, endOn: dto.endOn ? asDate(dto.endOn) : null, createdBy: v.userId! } });
      await audit(tx, c, 'payroll.court_order.added', 'employee', e.employeeId, { courtOrderId: o.id, orderRef: dto.orderRef });
      return { id: o.id };
    });
  }

  // ------------------------------------------------------------------------------------------ journal and cost rates (PAY-3.17)

  async costRates(ctx: TenantContext, user: ScopeUser, month: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = await entitiesFor(tx, c, v, 'payroll.cost_rate.view');
      await payScope(tx, ids);
      const rows = await tx.employeeCostRate.findMany({ where: { organizationId: c.organizationId, legalEntityId: { in: ids }, periodStart: asDate(`${month}-01`) } });
      await audit(tx, c, 'payroll.cost_rates.viewed', 'payroll_input', month, { rows: rows.length });
      return rows.map((r) => ({ employeeId: r.employeeId, month, employerCost: r.employerCost.toFixed(2), standardHours: r.standardHours.toFixed(2), rate: r.rate.toFixed(4), provisional: r.provisional }));
    });
  }
}

