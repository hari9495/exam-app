import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrgSecretsCryptoService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import type { ScopeUser, Viewer } from '../access/scope';
import { asDate, dateOf, monthRange } from '../time/time-core';
import { ApprovalsEngine, type Notice } from '../workflow/approvals-engine.service';
import { CourtOrderDto, HoldDto, LoanChangeDto, LoanRequestDto, LopRowDto, OneTimeDto, SpecialDaysDto } from './dto-5c';
import { PayKey, entitiesFor, payHolders, payScope, payViewer, requireEntity, requireSelf } from './pay-access';

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
  async saveLop(ctx: TenantContext, user: ScopeUser, month: string, rows: LopRowDto[], source: 'manual' | 'upload' = 'manual') {
    const v = await this.viewer(user);
    const days = Number(monthRange(month).to.slice(8));
    const bad = rows.map((r, i) => (D(r.lopDays).gt(days) ? `Row ${i + 1}: more than ${days} days.` : null)).filter(Boolean);
    if (bad.length) throw new BadRequestException({ statusCode: 400, code: 'LOP_ROWS', message: bad.join(' '), rows: bad });
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      for (const r of rows) {
        const e = await this.person(tx, c, v, 'payroll.input.manage', r.employeeId, monthRange(month).to);
        await this.notLocked(tx, c.organizationId, e.legalEntityId, month);
        await tx.lopInput.upsert({ where: { organizationId_employmentId_periodStart: { organizationId: c.organizationId, employmentId: e.id, periodStart: asDate(`${month}-01`) } }, update: { lopDays: r.lopDays, reason: r.reason, source, enteredBy: v.userId!, enteredAt: new Date() }, create: { organizationId: c.organizationId, legalEntityId: e.legalEntityId, employeeId: e.employeeId, employmentId: e.id, periodStart: asDate(`${month}-01`), lopDays: r.lopDays, reason: r.reason, source, enteredBy: v.userId! } });
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
      const limit = await settingFor(tx, c, 'payroll.one_time_review_above', { legalEntityId: e.legalEntityId });
      const review = limit !== 'none' && D(dto.amount).gt(limit);
      const row = await tx.oneTimePay.create({ data: { organizationId: org, legalEntityId: e.legalEntityId, employeeId: e.employeeId, employmentId: e.id, componentCode: comp.code, amount: dto.amount, periodStart: asDate(`${dto.month}-01`), endOn: dto.endOn ? asDate(dto.endOn) : null, reason: dto.reason, status: review ? 'pending' : 'approved', createdBy: v.userId! } });
      if (review) {
        const approvers = await this.approversFor(tx, org, 'payroll.run.approve', e.legalEntityId, v.userId!, e.employeeId);
        if (!approvers.length) throw new BadRequestException(`One-time pay above ₹${limit} needs someone else to approve it. Give a second person "payroll.run.approve".`);
        const sub = await this.engine.submit(tx, c, { type: ONE_TIME, subjectType: 'one_time_pay', subjectId: row.id, title: `One-time pay of ₹${dto.amount}`, summary: [{ label: 'Component', value: comp.name }, { label: 'Month', value: dto.month }, { label: 'Why', value: dto.reason.slice(0, 200) }], subjectPersonId: null, requesterUserId: v.userId!, raisedByUserId: v.userId!, steps: [{ name: 'Payroll approval', approvers: [{ kind: 'users', userIds: approvers }], mode: 'any', remindAfterHours: 24 }], payload: {}, payloadFields: [], fallbackUserIds: [] });
        notices.push(...sub.notices);
        await tx.oneTimePay.update({ where: { id: row.id }, data: { wfRequestId: sub.id } });
      }
      await audit(tx, c, 'payroll.one_time.added', 'one_time_pay', row.id, { employeeId: e.employeeId, componentCode: comp.code, month: dto.month, review });
      return { id: row.id, status: row.status };
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

  /** Releases a hold (idempotent: a second release changes nothing); the held pay goes in the next payment. */
  async releaseHold(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await payScope(tx, await entitiesFor(tx, c, v, 'payroll.hold.manage'));
      const h = await tx.payrollWithhold.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!h) throw new NotFoundException('Not found');
      if (await this.isSelf(tx, c.organizationId, v, h.employeeId)) throw new ForbiddenException('Someone else releases a hold on your pay.');
      if (h.releasedAt) return { id, released: true, releasedAt: h.releasedAt };
      const n = await tx.payrollWithhold.updateMany({ where: { id, releasedAt: null }, data: { releasedAt: new Date(), releasedBy: v.userId } });
      if (n.count) await audit(tx, c, 'payroll.hold.released', 'employee', h.employeeId, { holdId: id, amount: h.amount?.toFixed(2) ?? null });
      const after = await tx.payrollWithhold.findFirstOrThrow({ where: { id } });
      return { id, released: true, releasedAt: after.releasedAt };
    });
  }

  // ------------------------------------------------------------------------------------------ loans and advances (Q4)

  /** A request for oneself (implicit), or by payroll for someone in scope; approved by someone else through P03. */
  async requestLoan(ctx: TenantContext, user: ScopeUser, dto: LoanRequestDto) {
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
      await payScope(tx, forSelf ? [] : [e.legalEntityId]);
      const principal = D(dto.principal);
      const emi = loanEmi(principal, D(dto.interestRate ?? '0'), dto.instalments);
      const approvers = await this.approversFor(tx, org, 'payroll.loan.approve', e.legalEntityId, v.userId!, employeeId);
      if (!approvers.length) throw new BadRequestException('No one can approve this request yet. A payroll approver needs "payroll.loan.approve".');
      const [row] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO loans (organization_id, legal_entity_id, employee_id, employment_id, loan_type, principal, interest_rate, emi, first_month, outstanding, reason, requested_by)
        VALUES (${org}::uuid, ${e.legalEntityId}::uuid, ${employeeId}::uuid, ${e.id}::uuid, ${dto.loanType}, ${principal}, ${D(dto.interestRate ?? '0')}, ${emi}, ${on}::date, ${principal}, ${dto.reason}, ${v.userId}::uuid) RETURNING id::text`;
      const sub = await this.engine.submit(tx, c, { type: LOAN, subjectType: 'loan', subjectId: row.id, title: `${dto.loanType === 'loan' ? 'Loan' : 'Salary advance'} of ₹${principal.toFixed(2)}`, summary: [{ label: 'Instalments', value: `${dto.instalments} of ₹${emi.toFixed(2)} from ${dto.firstMonth}` }, { label: 'Why', value: dto.reason.slice(0, 200) }], subjectPersonId: null, requesterUserId: v.userId!, raisedByUserId: v.userId!, steps: [{ name: 'Payroll approval', approvers: [{ kind: 'users', userIds: approvers }], mode: 'any', remindAfterHours: 24 }], payload: {}, payloadFields: [], fallbackUserIds: [] });
      notices.push(...sub.notices);
      await tx.loan.update({ where: { id: row.id }, data: { wfRequestId: sub.id } });
      await audit(tx, c, 'payroll.loan.requested', 'loan', row.id, { employeeId, loanType: dto.loanType, instalments: dto.instalments, forSelf });
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
      return rows.map((l) => ({ id: l.id, employeeId: l.employeeId, loanType: l.loanType, principal: l.principal.toFixed(2), emi: l.emi.toFixed(2), outstanding: l.outstanding.toFixed(2), firstMonth: dateOf(l.firstMonth).slice(0, 7), status: l.status, pausedUntil: l.pausedUntil ? dateOf(l.pausedUntil).slice(0, 7) : null, mine: l.employeeId === me?.id }));
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
      await tx.loan.update({ where: { id }, data });
      await tx.loanScheduleChange.create({ data: { organizationId: c.organizationId, legalEntityId: l.legalEntityId, employeeId: l.employeeId, loanId: id, kind: dto.kind, detail: { pauseUntil: dto.pauseUntil ?? null, emi: dto.emi ?? null, outstandingBefore: l.outstanding.toFixed(2) }, reason: dto.reason, changedBy: v.userId! } });
      await audit(tx, c, 'payroll.loan.changed', 'loan', id, { kind: dto.kind, reason: dto.reason });
      return { id, kind: dto.kind };
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

  async journal(ctx: TenantContext, user: ScopeUser, runId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = await entitiesFor(tx, c, v, 'payroll.journal.export');
      await payScope(tx, ids);
      const j = await tx.journal.findFirst({ where: { organizationId: c.organizationId, runId, legalEntityId: { in: ids } } });
      if (!j) throw new NotFoundException('No journal yet: it is made when the payroll is approved.');
      return { runId, lines: j.lines, exports: j.exports };
    });
  }

  /** CSV, Tally (XML vouchers) or Zoho Books (CSV journal) for the accountant; each export is recorded. */
  async exportJournal(ctx: TenantContext, user: ScopeUser, runId: string, format: 'csv' | 'tally' | 'zoho') {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = await entitiesFor(tx, c, v, 'payroll.journal.export');
      await payScope(tx, ids);
      const j = await tx.journal.findFirst({ where: { organizationId: c.organizationId, runId, legalEntityId: { in: ids } } });
      if (!j) throw new NotFoundException('No journal yet: it is made when the payroll is approved.');
      const run = await tx.payrollRun.findFirstOrThrow({ where: { organizationId: c.organizationId, id: runId } });
      const month = dateOf(run.periodStart).slice(0, 7);
      const lines = j.lines as { ledger: string; debit: string; credit: string }[];
      const csvCell = (s: string) => (/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""');
      const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      let file: string;
      let name: string;
      let type: string;
      if (format === 'tally') {
        const entries = lines.map((l) => `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${xml(l.ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>${D(l.debit).gt(0) ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE><AMOUNT>${D(l.debit).gt(0) ? `-${l.debit}` : l.credit}</AMOUNT></ALLLEDGERENTRIES.LIST>`).join('');
        file = `<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME></REQUESTDESC><REQUESTDATA><TALLYMESSAGE><VOUCHER VCHTYPE="Journal" ACTION="Create"><DATE>${monthRange(month).to.replace(/-/g, '')}</DATE><NARRATION>Payroll ${month}</NARRATION>${entries}</VOUCHER></TALLYMESSAGE></REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
        name = `payroll-journal-${month}-tally.xml`;
        type = 'application/xml';
      } else {
        const head = format === 'zoho' ? 'Journal Date,Reference Number,Notes,Account,Debit,Credit' : 'Ledger,Debit,Credit';
        const rows = lines.map((l) => (format === 'zoho' ? `${monthRange(month).to},PAYROLL-${month},"Payroll ${month}","${csvCell(l.ledger)}",${l.debit},${l.credit}` : `"${csvCell(l.ledger)}",${l.debit},${l.credit}`));
        file = [head, ...rows].join('\r\n') + '\r\n';
        name = `payroll-journal-${month}${format === 'zoho' ? '-zoho' : ''}.csv`;
        type = 'text/csv';
      }
      const exports = [...(j.exports as unknown[]), { format, at: new Date().toISOString(), by: v.userId }];
      await tx.journal.update({ where: { id: j.id }, data: { exports: exports as Prisma.InputJsonValue } });
      await tx.payrollRun.update({ where: { id: runId }, data: { postedAt: run.postedAt ?? new Date() } });
      await audit(tx, c, 'payroll.journal.exported', 'payroll_run', runId, { format });
      return { file: Buffer.from(file, 'utf8'), name, contentType: type };
    });
  }

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

