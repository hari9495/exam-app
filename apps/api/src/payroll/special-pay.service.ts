import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import type { ScopeUser, Viewer } from '../access/scope';
import { StatutoryRulesService } from '../statutory/statutory.service';
import { inForce, layoff as layoffRule, minWage, minWageTableFor } from '../statutory/evaluator';
import { asDate, dateOf, monthRange } from '../time/time-core';
import { ApprovalsEngine } from '../workflow/approvals-engine.service';
import type { AuthorisationDto, ClawbackDto, IncentivePlanDto, IncentiveResultsDto, LayoffDto, OncallRuleDto, OncallSlotDto, OutputRowDto, RateCardDto, SettlementDto, TipPoolDto, UnionDto, VrsDto } from './dto-5i';
import { MODULE_SOURCES, PayrollIntakeService } from './intake.service';
import { entitiesFor, payHolders, payScope, payViewer, requireEntity, requireSelf } from './pay-access';
import { SpecialPayError, incentive, oncall, pieceRate, settlementArrears, tipShares, unionDues, vrsSplit, type Tier } from './special';

// Batch 5i special pay (M03-BUILD-DESIGN §17.9; PAY-9.02, 9.04, 9.06 … 9.08; YX-PAY-59 … 63, YX-TAX-21). Each kind keeps
// its own inputs (rate cards and output, plans and results, pools, on-call slots, union authorisations, settlements,
// lay-off days, VRS payouts) and sends a month's lines to payroll as a posting: made by someone with
// payroll.special.manage, approved through P03 by a payroll approver who neither made it nor is paid in it. An approved
// posting becomes approved one-time pay (PayrollIntakeService, once per posting line), which the run pays.
// DECISION NEEDED: on-call slots and lay-off days are entered here until M02 records them (YX-PAY-62 / 63 name M02 as the source).

export const SPECIAL_POSTING = 'payroll.special_posting';
type Kind = 'piece' | 'incentive' | 'tips' | 'oncall' | 'union' | 'settle' | 'layoff' | 'vrs';
type Code = (typeof MODULE_SOURCES)[Kind][number];
export interface Line {
  employeeId: string;
  componentCode: Code;
  amount: string;
  label: string;
  meta?: Record<string, string>;
}
const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);
const ZERO = D(0);
const KIND_TEXT: Record<Kind, string> = { piece: 'Piece-rate pay', incentive: 'Incentives', tips: 'Tips', oncall: 'On-call pay', union: 'Union dues', settle: 'Settlement arrears', layoff: 'Lay-off compensation', vrs: 'VRS compensation' };
const monthStart = (m: string) => asDate(`${m}-01`);
const monthDays = (m: string) => Number(monthRange(m).to.slice(8));

@Injectable()
export class SpecialPayService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly engine: ApprovalsEngine,
    private readonly rules: StatutoryRulesService,
    private readonly intake: PayrollIntakeService,
  ) {}

  onModuleInit() {
    this.engine.register({
      key: SPECIAL_POSTING,
      label: 'Special pay',
      risk: 'normal',
      autoActions: false,
      distinctSteps: true,
      onDecided: (tx, req, o) => this.decided(tx, req, o),
      requesterLink: () => '/yx/payroll/special-pay',
    });
  }

  private async viewer(user: ScopeUser) {
    const v = await payViewer(this.prisma, this.tenantPrisma, user);
    requireSelf(v);
    return v;
  }

  /** The entity is reached by payroll.special.manage, and the pay guard opened to it. */
  private async entity(tx: Tx, c: CompanyContext, v: Viewer, entityId: string) {
    await requireEntity(tx, c, v, 'payroll.special.manage', entityId);
    await payScope(tx, [entityId]);
  }

  /** The person's employment in that entity during the month (refused as "not found" elsewhere). */
  private async employment(tx: Tx, org: string, entityId: string, employeeId: string, from: string, to: string) {
    const e = await tx.employment.findFirst({ where: { organizationId: org, legalEntityId: entityId, employeeId, joinedOn: { lte: asDate(to) }, OR: [{ exitedOn: null }, { exitedOn: { gte: asDate(from) } }] }, orderBy: { joinedOn: 'desc' } });
    if (!e) throw new NotFoundException('This person has no employment in this legal entity then.');
    return e;
  }

  /** Monthly basic and DA from the salary in force on a day (union dues, lay-off pay). */
  private async basicDa(tx: Tx, org: string, employmentId: string, on: string) {
    const comp = await tx.compensation.findFirst({ where: { organizationId: org, employmentId, supersededAt: null, validFrom: { lte: asDate(on) }, OR: [{ validTo: null }, { validTo: { gte: asDate(on) } }] }, orderBy: { validFrom: 'desc' } });
    if (!comp) return ZERO;
    const pkg = await tx.compensationPackage.findFirst({ where: { organizationId: org, changeId: comp.changeId } });
    if (!pkg) return ZERO;
    const comps = await tx.payComponent.findMany({ where: { organizationId: org, code: { in: ['basic', 'da'] } }, select: { id: true } });
    const lines = await tx.compensationLine.findMany({ where: { organizationId: org, packageId: pkg.id, componentId: { in: comps.map((x) => x.id) } } });
    return lines.reduce((t, l) => t.add(l.monthly), ZERO);
  }

  // ------------------------------------------------------------------------------------------ postings

  /** A month's lines sent to payroll; the sheet (`sourceRef`) has at most one live posting. */
  private async post(tx: Tx, c: CompanyContext, v: Viewer, p: { kind: Kind; entityId: string; month: string; sourceRef: string; lines: Line[]; title: string }) {
    const org = c.organizationId;
    const lines = p.lines.filter((l) => D(l.amount).gt(0));
    if (!lines.length) throw new BadRequestException('Nothing to pay for this month.');
    const total = lines.reduce((t, l) => t.add(l.amount), ZERO);
    const paid = (await tx.employee.findMany({ where: { organizationId: org, id: { in: [...new Set(lines.map((l) => l.employeeId))] } }, select: { userId: true } })).map((e) => e.userId).filter((u): u is string => !!u);
    if (paid.includes(v.userId!)) throw new ForbiddenException('This sheet pays you, so someone else sends it.');
    const approvers = (await payHolders(tx, org, 'payroll.run.approve', p.entityId, todayIst())).filter((u) => u !== v.userId && !paid.includes(u));
    if (!approvers.length) throw new BadRequestException('No one can approve this yet. A payroll approver who is not paid in it needs "payroll.run.approve".');
    let row: Prisma.SpecialPostingGetPayload<object>;
    try {
      row = await tx.specialPosting.create({ data: { organizationId: org, legalEntityId: p.entityId, kind: p.kind, month: monthStart(p.month), sourceRef: p.sourceRef, lines: lines as unknown as Prisma.InputJsonValue, total, madeBy: v.userId! } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('This sheet is already sent to payroll. A turned-down one can be sent again.');
      throw e;
    }
    const sub = await this.engine.submit(tx, c, {
      type: SPECIAL_POSTING,
      subjectType: 'special_posting',
      subjectId: row.id,
      title: `${KIND_TEXT[p.kind]}: ${p.title}`,
      summary: [
        { label: 'Month', value: p.month },
        { label: 'People', value: String(new Set(lines.map((l) => l.employeeId)).size) },
        { label: 'Total', value: `₹${total.toFixed(2)}` },
      ],
      subjectPersonId: null,
      requesterUserId: v.userId!,
      raisedByUserId: v.userId!,
      steps: [{ name: 'Payroll approval', approvers: [{ kind: 'users', userIds: approvers }], mode: 'any', remindAfterHours: 24 }],
      payload: {},
      payloadFields: [],
      fallbackUserIds: [],
    });
    await tx.specialPosting.update({ where: { id: row.id }, data: { wfRequestId: sub.id } });
    await audit(tx, c, 'payroll.special.posted', 'special_posting', row.id, { kind: p.kind, month: p.month, lines: lines.length, total: total.toFixed(2), sourceRef: p.sourceRef });
    return { posting: this.postingView({ ...row, wfRequestId: sub.id }), notices: sub.notices };
  }

  /** Approved: each line becomes approved one-time pay for the month (once per line, so a retry never pays twice). */
  private async decided(tx: Tx, wf: Prisma.WfRequestGetPayload<object>, outcome: 'approved' | 'rejected') {
    const org = wf.organizationId;
    const c = { organizationId: org, isSuperAdmin: false } as CompanyContext;
    const all = (await tx.legalEntity.findMany({ where: { organizationId: org }, select: { id: true } })).map((e) => e.id);
    await payScope(tx, all);
    const p = await tx.specialPosting.findFirst({ where: { organizationId: org, id: wf.subjectId, status: 'pending' } });
    if (!p) return;
    if (outcome === 'approved') {
      const month = dateOf(p.month).slice(0, 7);
      for (const [i, l] of (p.lines as unknown as Line[]).entries()) {
        await this.intake.oneTime(tx, c, { source: p.kind as Kind, sourceRef: `${p.id}:${i}`, employeeId: l.employeeId, componentCode: l.componentCode, amount: l.amount, month, reason: l.label, by: p.madeBy });
      }
    }
    await tx.specialPosting.update({ where: { id: p.id }, data: { status: outcome, decidedAt: new Date() } });
    await audit(tx, c, `payroll.special.${outcome}`, 'special_posting', p.id, { kind: p.kind, total: p.total.toFixed(2) });
  }

  private postingView(p: Prisma.SpecialPostingGetPayload<object>) {
    return { id: p.id, legalEntityId: p.legalEntityId, kind: p.kind, month: dateOf(p.month).slice(0, 7), sourceRef: p.sourceRef, lines: p.lines as unknown as Line[], total: p.total.toFixed(2), status: p.status, requestId: p.wfRequestId, madeBy: p.madeBy, createdAt: p.createdAt };
  }

  async postings(ctx: TenantContext, user: ScopeUser, entityId: string, month?: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.entity(tx, c, v, entityId);
      const rows = await tx.specialPosting.findMany({ where: { organizationId: c.organizationId, legalEntityId: entityId, ...(month ? { month: monthStart(month) } : {}) }, orderBy: { createdAt: 'desc' }, take: 200 });
      return rows.map((p) => ({ ...this.postingView(p), madeByMe: p.madeBy === v.userId }));
    });
  }

  /** Runs `fn` in the entity's transaction and sends the approval notices after commit. */
  private async posting<T extends { notices: Parameters<ApprovalsEngine['send']>[1] }>(ctx: TenantContext, fn: (tx: Tx, c: CompanyContext) => Promise<T>) {
    const out = await inCompany(this.tenantPrisma, ctx, fn);
    await this.engine.send(ctx, out.notices);
    const { notices: _n, ...rest } = out;
    return rest;
  }

  private fail(e: unknown): never {
    if (e instanceof SpecialPayError) throw new BadRequestException(e.message);
    throw e;
  }

  // ------------------------------------------------------------------------------------------ piece-rate (PAY-9.02)

  async cards(ctx: TenantContext, user: ScopeUser, entityId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.entity(tx, c, v, entityId);
      const rows = await tx.pieceRateCard.findMany({ where: { organizationId: c.organizationId, legalEntityId: entityId }, orderBy: [{ operationCode: 'asc' }, { validFrom: 'desc' }] });
      return rows.map((r) => ({ id: r.id, operationCode: r.operationCode, name: r.name, unit: r.unit, rate: r.rate.toString(), validFrom: dateOf(r.validFrom), validTo: r.validTo ? dateOf(r.validTo) : null }));
    });
  }

  /** A new rate from a date ends the operation's current rate the day before (rate cards are dated, never edited). */
  async addCard(ctx: TenantContext, user: ScopeUser, dto: RateCardDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      await this.entity(tx, c, v, dto.legalEntityId);
      const open = await tx.pieceRateCard.findFirst({ where: { organizationId: org, legalEntityId: dto.legalEntityId, operationCode: dto.operationCode, validTo: null } });
      if (open && dateOf(open.validFrom) >= dto.validFrom) throw new ConflictException(`${dto.operationCode} already has a rate from ${dateOf(open.validFrom)}; a new rate starts after it.`);
      if (open) await tx.pieceRateCard.update({ where: { id: open.id }, data: { validTo: new Date(asDate(dto.validFrom).getTime() - 86_400_000) } });
      const row = await tx.pieceRateCard.create({ data: { organizationId: org, legalEntityId: dto.legalEntityId, operationCode: dto.operationCode, name: dto.name, unit: dto.unit, rate: D(dto.rate), validFrom: asDate(dto.validFrom), createdBy: v.userId! } });
      await audit(tx, c, 'payroll.piece.rate_added', 'piece_rate_card', row.id, { operationCode: dto.operationCode, rate: dto.rate, validFrom: dto.validFrom, previous: open?.id ?? null });
      return { id: row.id };
    });
  }

  /** Output by person, day and operation; a day already keyed is replaced. Refused once the month is posted. */
  async addOutputs(ctx: TenantContext, user: ScopeUser, entityId: string, rows: OutputRowDto[], source: 'manual' | 'import' = 'manual') {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      await this.entity(tx, c, v, entityId);
      const months = [...new Set(rows.map((r) => r.workDate.slice(0, 7)))];
      for (const m of months) {
        const live = await tx.specialPosting.findFirst({ where: { organizationId: org, kind: 'piece', sourceRef: `piece:${entityId}:${m}`, status: { in: ['pending', 'approved'] } } });
        if (live) throw new ConflictException(`${m}'s piece-rate pay is already sent to payroll.`);
      }
      for (const r of rows) {
        const e = await this.employment(tx, org, entityId, r.employeeId, r.workDate, r.workDate);
        await tx.pieceOutput.upsert({
          where: { organizationId_employmentId_workDate_operationCode: { organizationId: org, employmentId: e.id, workDate: asDate(r.workDate), operationCode: r.operationCode } },
          create: { organizationId: org, legalEntityId: entityId, employeeId: r.employeeId, employmentId: e.id, workDate: asDate(r.workDate), operationCode: r.operationCode, quantity: D(r.quantity), source, createdBy: v.userId! },
          update: { quantity: D(r.quantity), source, createdBy: v.userId! },
        });
      }
      await audit(tx, c, 'payroll.piece.output_saved', 'legal_entity', entityId, { rows: rows.length, months, source });
      return { saved: rows.length };
    });
  }

  /** A CSV of employee_code, date, operation, quantity (up to 5,000 rows); every row is checked before any is saved. */
  async importOutputs(ctx: TenantContext, user: ScopeUser, entityId: string, file: Buffer | undefined) {
    if (!file?.length) throw new BadRequestException('Attach the output file (CSV).');
    let recs: Record<string, string>[];
    try {
      recs = parse(file, { columns: (h: string[]) => h.map((x) => x.trim().toLowerCase()), skip_empty_lines: true, trim: true, bom: true, to: 5001 });
    } catch {
      throw new BadRequestException('The file is not a CSV with the columns employee_code, date, operation, quantity.');
    }
    if (recs.length > 5000) throw new BadRequestException('A file has at most 5,000 rows.');
    const codes = [...new Set(recs.map((r) => r.employee_code))];
    const people = await inCompany(this.tenantPrisma, ctx, async (tx, c) =>
      tx.employment.findMany({ where: { organizationId: c.organizationId, legalEntityId: entityId, employeeCode: { in: codes } }, select: { employeeId: true, employeeCode: true } }),
    );
    const problems: string[] = [];
    const rows = recs.map((r, i) => {
      const who = people.find((p) => p.employeeCode === r.employee_code);
      if (!who) problems.push(`Row ${i + 2}: no employee ${r.employee_code ?? ''} in this legal entity.`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date ?? '')) problems.push(`Row ${i + 2}: the date is YYYY-MM-DD.`);
      if (!/^[A-Za-z0-9_-]{1,30}$/.test(r.operation ?? '')) problems.push(`Row ${i + 2}: the operation code.`);
      if (!/^\d{1,9}(\.\d{1,3})?$/.test(r.quantity ?? '') || Number(r.quantity) <= 0) problems.push(`Row ${i + 2}: the quantity is a number above zero.`);
      return { employeeId: who?.employeeId ?? '', workDate: r.date, operationCode: (r.operation ?? '').toUpperCase(), quantity: r.quantity } as OutputRowDto;
    });
    if (problems.length) throw new BadRequestException({ statusCode: 400, message: 'Nothing was saved. Fix these rows.', problems: problems.slice(0, 50) });
    return this.addOutputs(ctx, user, entityId, rows, 'import');
  }

  async outputs(ctx: TenantContext, user: ScopeUser, entityId: string, month: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.entity(tx, c, v, entityId);
      const { from, to } = monthRange(month);
      const rows = await tx.pieceOutput.findMany({ where: { organizationId: c.organizationId, legalEntityId: entityId, workDate: { gte: asDate(from), lte: asDate(to) } }, orderBy: [{ workDate: 'asc' }] });
      return rows.map((r) => ({ id: r.id, employeeId: r.employeeId, workDate: dateOf(r.workDate), operationCode: r.operationCode, quantity: r.quantity.toString(), source: r.source }));
    });
  }

  /** The month's piece pay per person, topped up to the minimum wage for the days worked (P07 IN.MW at the work place). */
  async postPiece(ctx: TenantContext, user: ScopeUser, entityId: string, month: string) {
    const v = await this.viewer(user);
    return this.posting(ctx, async (tx, c) => {
      const org = c.organizationId;
      await this.entity(tx, c, v, entityId);
      const { from, to } = monthRange(month);
      const outputs = await tx.pieceOutput.findMany({ where: { organizationId: org, legalEntityId: entityId, workDate: { gte: asDate(from), lte: asDate(to) } } });
      if (!outputs.length) throw new BadRequestException(`No output is keyed for ${month}.`);
      const cards = (await tx.pieceRateCard.findMany({ where: { organizationId: org, legalEntityId: entityId } })).map((x) => ({ operationCode: x.operationCode, rate: x.rate.toString(), validFrom: dateOf(x.validFrom), validTo: x.validTo ? dateOf(x.validTo) : null }));
      const rules = await this.rules.published();
      const lines: Line[] = [];
      for (const employmentId of [...new Set(outputs.map((o) => o.employmentId))]) {
        const mine = outputs.filter((o) => o.employmentId === employmentId);
        const asg = await tx.employeeAssignment.findFirst({ where: { organizationId: org, employmentId, supersededAt: null, validFrom: { lte: asDate(to) }, OR: [{ validTo: null }, { validTo: { gte: asDate(from) } }] }, orderBy: { validFrom: 'desc' } });
        const loc = asg ? await tx.location.findFirst({ where: { organizationId: org, id: asg.locationId }, select: { state: true, minWageZone: true } }) : null;
        const mwRs = inForce(rules, 'IN.MW', ['IN'], to);
        const daily = mwRs && loc ? minWage(mwRs, { table: minWageTableFor(rules, loc.state, to), zone: loc.minWageZone, skill: asg?.skillClass ?? null }).daily.toFixed(2) : '0';
        let r: ReturnType<typeof pieceRate>;
        try {
          r = pieceRate(cards, mine.map((o) => ({ workDate: dateOf(o.workDate), operationCode: o.operationCode, quantity: o.quantity.toString() })), daily);
        } catch (e) {
          this.fail(e);
        }
        const who = mine[0].employeeId;
        lines.push({ employeeId: who, componentCode: 'piece_pay', amount: r.earnings.toFixed(2), label: `Piece-rate pay for ${r.daysWorked} days in ${month}.`, meta: { days: String(r.daysWorked) } });
        if (r.topUp.gt(0)) lines.push({ employeeId: who, componentCode: 'min_wage_topup', amount: r.topUp.toFixed(2), label: `Top-up to the minimum wage of ₹${daily} a day for ${r.daysWorked} days worked.`, meta: { minimum: r.minimum.toFixed(2) } });
      }
      return this.post(tx, c, v, { kind: 'piece', entityId, month, sourceRef: `piece:${entityId}:${month}`, lines, title: month });
    });
  }

  // ------------------------------------------------------------------------------------------ incentives (PAY-9.06)

  async plans(ctx: TenantContext, user: ScopeUser, entityId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.entity(tx, c, v, entityId);
      const rows = await tx.incentivePlan.findMany({ where: { organizationId: c.organizationId, legalEntityId: entityId }, orderBy: { name: 'asc' } });
      return rows.map((p) => ({ id: p.id, name: p.name, kind: p.kind, metric: p.metric, targetAmount: p.targetAmount.toFixed(2), tiers: p.tiers as unknown as Tier[], capPercent: p.capPercent?.toString() ?? null, clawbackDays: p.clawbackDays, status: p.status }));
    });
  }

  async addPlan(ctx: TenantContext, user: ScopeUser, dto: IncentivePlanDto) {
    const v = await this.viewer(user);
    try {
      incentive({ targetAmount: dto.targetAmount, tiers: dto.tiers, capPercent: dto.capPercent ?? null }, '100', '100');
    } catch (e) {
      this.fail(e);
    }
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.entity(tx, c, v, dto.legalEntityId);
      const p = await tx.incentivePlan.create({ data: { organizationId: c.organizationId, legalEntityId: dto.legalEntityId, name: dto.name, kind: dto.kind, metric: dto.metric, targetAmount: D(dto.targetAmount), tiers: dto.tiers as unknown as Prisma.InputJsonValue, capPercent: dto.capPercent ? D(dto.capPercent) : null, clawbackDays: dto.clawbackDays, createdBy: v.userId! } });
      await audit(tx, c, 'payroll.incentive.plan_added', 'incentive_plan', p.id, { name: dto.name, kind: dto.kind, tiers: dto.tiers.length });
      return { id: p.id };
    });
  }

  private async planFor(tx: Tx, c: CompanyContext, v: Viewer, id: string) {
    const ids = await entitiesFor(tx, c, v, 'payroll.special.manage');
    await payScope(tx, ids);
    const p = await tx.incentivePlan.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!p || !ids.includes(p.legalEntityId)) throw new NotFoundException('Not found');
    return p;
  }

  /** The month's quota and actual per person, worked out on the plan's tiers (replaced until the month is sent). */
  async saveResults(ctx: TenantContext, user: ScopeUser, planId: string, dto: IncentiveResultsDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const p = await this.planFor(tx, c, v, planId);
      if (p.status !== 'active') throw new ConflictException('This plan is switched off.');
      const posted = await tx.incentiveResult.count({ where: { organizationId: org, planId, month: monthStart(dto.month), postingId: { not: null } } });
      if (posted) throw new ConflictException(`${dto.month}'s results are already sent to payroll.`);
      const { from, to } = monthRange(dto.month);
      const out = [];
      for (const r of dto.rows) {
        const e = await this.employment(tx, org, p.legalEntityId, r.employeeId, from, to);
        let x: ReturnType<typeof incentive>;
        try {
          x = incentive({ targetAmount: p.targetAmount.toString(), tiers: p.tiers as unknown as Tier[], capPercent: p.capPercent?.toString() ?? null }, r.quota, r.actual);
        } catch (err) {
          this.fail(err);
        }
        const data = { quota: D(r.quota), actual: D(r.actual), amount: x.amount, workings: { plan: p.name, attainment: x.attainment, capped: x.capped, bands: x.bands } as unknown as Prisma.InputJsonValue, createdBy: v.userId! };
        const row = await tx.incentiveResult.upsert({
          where: { organizationId_planId_employmentId_month: { organizationId: org, planId, employmentId: e.id, month: monthStart(dto.month) } },
          create: { organizationId: org, legalEntityId: p.legalEntityId, planId, employeeId: r.employeeId, employmentId: e.id, month: monthStart(dto.month), ...data },
          update: data,
        });
        out.push({ id: row.id, employeeId: r.employeeId, attainment: x.attainment, amount: x.amount.toFixed(2), capped: x.capped });
      }
      await audit(tx, c, 'payroll.incentive.results_saved', 'incentive_plan', planId, { month: dto.month, rows: out.length });
      return out;
    });
  }

  async results(ctx: TenantContext, user: ScopeUser, planId: string, month: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.planFor(tx, c, v, planId);
      const rows = await tx.incentiveResult.findMany({ where: { organizationId: c.organizationId, planId, month: monthStart(month) } });
      return rows.map((r) => ({ id: r.id, employeeId: r.employeeId, quota: r.quota.toFixed(2), actual: r.actual.toFixed(2), amount: r.amount.toFixed(2), workings: r.workings, posted: Boolean(r.postingId) }));
    });
  }

  async postIncentives(ctx: TenantContext, user: ScopeUser, planId: string, month: string) {
    const v = await this.viewer(user);
    return this.posting(ctx, async (tx, c) => {
      const org = c.organizationId;
      const p = await this.planFor(tx, c, v, planId);
      const rows = await tx.incentiveResult.findMany({ where: { organizationId: org, planId, month: monthStart(month), postingId: null } });
      const out = await this.post(tx, c, v, { kind: 'incentive', entityId: p.legalEntityId, month, sourceRef: `incentive:${planId}:${month}`, lines: rows.map((r) => ({ employeeId: r.employeeId, componentCode: 'incentive', amount: r.amount.toFixed(2), label: `${p.name}, ${month}: ${(r.workings as { attainment: string }).attainment} % of quota.` })), title: `${p.name}, ${month}` });
      await tx.incentiveResult.updateMany({ where: { organizationId: org, id: { in: rows.map((r) => r.id) } }, data: { postingId: out.posting.id } });
      return out;
    });
  }

  /** A clawback of a paid result within the plan's window, recovered in a later month as a deduction. */
  async addClawback(ctx: TenantContext, user: ScopeUser, dto: ClawbackDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const ids = await entitiesFor(tx, c, v, 'payroll.special.manage');
      await payScope(tx, ids);
      const r = await tx.incentiveResult.findFirst({ where: { organizationId: org, id: dto.resultId } });
      if (!r || !ids.includes(r.legalEntityId)) throw new NotFoundException('Not found');
      const p = await tx.incentivePlan.findFirstOrThrow({ where: { organizationId: org, id: r.planId } });
      const posting = r.postingId ? await tx.specialPosting.findFirst({ where: { organizationId: org, id: r.postingId, status: 'approved' } }) : null;
      if (!posting) throw new ConflictException('Only a result paid through payroll can be clawed back.');
      const end = new Date(posting.decidedAt!.getTime() + p.clawbackDays * 86_400_000);
      if (new Date() > end) throw new ConflictException(`The plan's ${p.clawbackDays}-day clawback window for this result has ended.`);
      const before = await tx.incentiveClawback.aggregate({ where: { organizationId: org, resultId: r.id }, _sum: { amount: true } });
      if (D(dto.amount).add(before._sum.amount ?? 0).gt(r.amount)) throw new BadRequestException('A clawback is never more than what was paid.');
      const row = await tx.incentiveClawback.create({ data: { organizationId: org, legalEntityId: r.legalEntityId, resultId: r.id, employeeId: r.employeeId, employmentId: r.employmentId, month: monthStart(dto.month), amount: D(dto.amount), reason: dto.reason, createdBy: v.userId! } });
      await audit(tx, c, 'payroll.incentive.clawback_added', 'incentive_clawback', row.id, { resultId: r.id, amount: dto.amount, month: dto.month });
      return { id: row.id };
    });
  }

  async postClawbacks(ctx: TenantContext, user: ScopeUser, entityId: string, month: string) {
    const v = await this.viewer(user);
    return this.posting(ctx, async (tx, c) => {
      const org = c.organizationId;
      await this.entity(tx, c, v, entityId);
      const rows = await tx.incentiveClawback.findMany({ where: { organizationId: org, legalEntityId: entityId, month: monthStart(month), postingId: null } });
      const out = await this.post(tx, c, v, { kind: 'incentive', entityId, month, sourceRef: `clawback:${entityId}:${month}`, lines: rows.map((r) => ({ employeeId: r.employeeId, componentCode: 'incentive_clawback', amount: r.amount.toFixed(2), label: `Incentive clawback: ${r.reason}` })), title: `clawbacks, ${month}` });
      await tx.incentiveClawback.updateMany({ where: { organizationId: org, id: { in: rows.map((r) => r.id) } }, data: { postingId: out.posting.id } });
      return out;
    });
  }

  /** The person's own statement: results and clawbacks (the pay guard shows only their rows). */
  async myIncentives(ctx: TenantContext, user: ScopeUser) {
    await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await payScope(tx, []);
      const org = c.organizationId;
      const results = await tx.incentiveResult.findMany({ where: { organizationId: org }, orderBy: { month: 'desc' }, take: 120 });
      const clawbacks = await tx.incentiveClawback.findMany({ where: { organizationId: org }, orderBy: { month: 'desc' }, take: 120 });
      return {
        results: results.map((r) => ({ id: r.id, plan: (r.workings as { plan?: string }).plan ?? null, month: dateOf(r.month).slice(0, 7), quota: r.quota.toFixed(2), actual: r.actual.toFixed(2), amount: r.amount.toFixed(2), workings: r.workings, sentToPayroll: Boolean(r.postingId) })),
        clawbacks: clawbacks.map((x) => ({ id: x.id, month: dateOf(x.month).slice(0, 7), amount: x.amount.toFixed(2), reason: x.reason })),
      };
    });
  }

  // ------------------------------------------------------------------------------------------ tips (PAY-9.07)

  /** A pool for an outlet and month, shared at once; tips paid by customers directly are kept for statements only. */
  async addPool(ctx: TenantContext, user: ScopeUser, dto: TipPoolDto) {
    const v = await this.viewer(user);
    let shares: ReturnType<typeof tipShares>;
    try {
      shares = tipShares(dto.amount, dto.shares.map((s) => ({ employmentId: s.employeeId, basis: s.basis })));
    } catch (e) {
      this.fail(e);
    }
    if (new Set(dto.shares.map((s) => s.employeeId)).size !== dto.shares.length) throw new BadRequestException('Each person is in the pool once.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const loc = await tx.location.findFirst({ where: { organizationId: org, id: dto.locationId } });
      if (!loc?.legalEntityId) throw new NotFoundException('Not found');
      await this.entity(tx, c, v, loc.legalEntityId);
      const { from, to } = monthRange(dto.month);
      let pool: Prisma.TipPoolGetPayload<object>;
      try {
        pool = await tx.tipPool.create({ data: { organizationId: org, legalEntityId: loc.legalEntityId, locationId: dto.locationId, month: monthStart(dto.month), amount: D(dto.amount), method: dto.method, paidDirect: dto.paidDirect, createdBy: v.userId! } });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(`${loc.name} already has a ${dto.paidDirect ? 'direct' : 'payroll'} tip pool for ${dto.month}.`);
        throw e;
      }
      for (const s of shares) {
        const e = await this.employment(tx, org, loc.legalEntityId, s.employmentId, from, to);
        await tx.tipShare.create({ data: { organizationId: org, legalEntityId: loc.legalEntityId, poolId: pool.id, employeeId: s.employmentId, employmentId: e.id, basis: D(s.basis), amount: s.amount } });
      }
      await audit(tx, c, 'payroll.tips.pool_added', 'tip_pool', pool.id, { locationId: dto.locationId, month: dto.month, amount: dto.amount, method: dto.method, people: shares.length, paidDirect: dto.paidDirect });
      return { id: pool.id, shares: shares.map((s) => ({ employeeId: s.employmentId, basis: s.basis, amount: s.amount.toFixed(2) })) };
    });
  }

  async pools(ctx: TenantContext, user: ScopeUser, entityId: string, month: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.entity(tx, c, v, entityId);
      const org = c.organizationId;
      const pools = await tx.tipPool.findMany({ where: { organizationId: org, legalEntityId: entityId, month: monthStart(month) } });
      const shares = await tx.tipShare.findMany({ where: { organizationId: org, poolId: { in: pools.map((p) => p.id) } } });
      const live = await tx.specialPosting.findMany({ where: { organizationId: org, kind: 'tips', sourceRef: { in: pools.map((p) => `tips:${p.id}`) }, status: { in: ['pending', 'approved'] } }, select: { sourceRef: true, status: true } });
      return pools.map((p) => ({
        id: p.id,
        locationId: p.locationId,
        month: dateOf(p.month).slice(0, 7),
        amount: p.amount.toFixed(2),
        method: p.method,
        paidDirect: p.paidDirect,
        posting: live.find((x) => x.sourceRef === `tips:${p.id}`)?.status ?? null,
        shares: shares.filter((s) => s.poolId === p.id).map((s) => ({ employeeId: s.employeeId, basis: s.basis.toString(), amount: s.amount.toFixed(2) })),
      }));
    });
  }

  async postPool(ctx: TenantContext, user: ScopeUser, poolId: string) {
    const v = await this.viewer(user);
    return this.posting(ctx, async (tx, c) => {
      const org = c.organizationId;
      const ids = await entitiesFor(tx, c, v, 'payroll.special.manage');
      await payScope(tx, ids);
      const pool = await tx.tipPool.findFirst({ where: { organizationId: org, id: poolId } });
      if (!pool || !ids.includes(pool.legalEntityId)) throw new NotFoundException('Not found');
      if (pool.paidDirect) throw new ConflictException('Tips paid by customers directly are not paid again through payroll.');
      const month = dateOf(pool.month).slice(0, 7);
      const shares = await tx.tipShare.findMany({ where: { organizationId: org, poolId } });
      return this.post(tx, c, v, { kind: 'tips', entityId: pool.legalEntityId, month, sourceRef: `tips:${pool.id}`, lines: shares.map((s) => ({ employeeId: s.employeeId, componentCode: 'tips', amount: s.amount.toFixed(2), label: `Tips pool ${month}: ${s.basis.toString()} ${pool.method}.` })), title: `tips ${month}` });
    });
  }

  // ------------------------------------------------------------------------------------------ on-call (PAY-9.08)

  async oncallRules(ctx: TenantContext, user: ScopeUser, entityId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.entity(tx, c, v, entityId);
      return (await tx.oncallRule.findMany({ where: { organizationId: c.organizationId, legalEntityId: entityId }, orderBy: { name: 'asc' } })).map((r) => ({ id: r.id, name: r.name, standbyAmount: r.standbyAmount.toFixed(2), calloutMinHours: r.calloutMinHours.toString(), calloutRate: r.calloutRate.toFixed(2), multiplier: r.multiplier.toString() }));
    });
  }

  async addOncallRule(ctx: TenantContext, user: ScopeUser, dto: OncallRuleDto) {
    const v = await this.viewer(user);
    if (Number(dto.multiplier) < 1) throw new BadRequestException('The call-out multiplier is at least 1.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.entity(tx, c, v, dto.legalEntityId);
      const r = await tx.oncallRule.create({ data: { organizationId: c.organizationId, legalEntityId: dto.legalEntityId, name: dto.name, standbyAmount: D(dto.standbyAmount), calloutMinHours: D(dto.calloutMinHours), calloutRate: D(dto.calloutRate), multiplier: D(dto.multiplier), createdBy: v.userId! } });
      await audit(tx, c, 'payroll.oncall.rule_added', 'oncall_rule', r.id, { name: dto.name });
      return { id: r.id };
    });
  }

  async addSlot(ctx: TenantContext, user: ScopeUser, dto: OncallSlotDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const ids = await entitiesFor(tx, c, v, 'payroll.special.manage');
      await payScope(tx, ids);
      const rule = await tx.oncallRule.findFirst({ where: { organizationId: org, id: dto.ruleId } });
      if (!rule || !ids.includes(rule.legalEntityId)) throw new NotFoundException('Not found');
      const month = dto.slotDate.slice(0, 7);
      if (await tx.specialPosting.findFirst({ where: { organizationId: org, kind: 'oncall', sourceRef: `oncall:${rule.legalEntityId}:${month}`, status: { in: ['pending', 'approved'] } } })) throw new ConflictException(`${month}'s on-call pay is already sent to payroll.`);
      const e = await this.employment(tx, org, rule.legalEntityId, dto.employeeId, dto.slotDate, dto.slotDate);
      try {
        const s = await tx.oncallSlot.create({ data: { organizationId: org, legalEntityId: rule.legalEntityId, ruleId: rule.id, employeeId: dto.employeeId, employmentId: e.id, slotDate: asDate(dto.slotDate), calloutHours: dto.calloutHours ? D(dto.calloutHours) : null, createdBy: v.userId! } });
        await audit(tx, c, 'payroll.oncall.slot_added', 'oncall_slot', s.id, { employeeId: dto.employeeId, date: dto.slotDate, calloutHours: dto.calloutHours ?? null });
        return { id: s.id };
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new ConflictException('This person already has that on-call slot on that day.');
        throw err;
      }
    });
  }

  async slots(ctx: TenantContext, user: ScopeUser, entityId: string, month: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.entity(tx, c, v, entityId);
      const { from, to } = monthRange(month);
      const rows = await tx.oncallSlot.findMany({ where: { organizationId: c.organizationId, legalEntityId: entityId, slotDate: { gte: asDate(from), lte: asDate(to) } }, orderBy: { slotDate: 'asc' } });
      return rows.map((s) => ({ id: s.id, ruleId: s.ruleId, employeeId: s.employeeId, slotDate: dateOf(s.slotDate), calloutHours: s.calloutHours?.toString() ?? null }));
    });
  }

  async postOncall(ctx: TenantContext, user: ScopeUser, entityId: string, month: string) {
    const v = await this.viewer(user);
    return this.posting(ctx, async (tx, c) => {
      const org = c.organizationId;
      await this.entity(tx, c, v, entityId);
      const { from, to } = monthRange(month);
      const slots = await tx.oncallSlot.findMany({ where: { organizationId: org, legalEntityId: entityId, slotDate: { gte: asDate(from), lte: asDate(to) } } });
      const rules = await tx.oncallRule.findMany({ where: { organizationId: org, id: { in: [...new Set(slots.map((s) => s.ruleId))] } } });
      const lines: Line[] = [];
      for (const employeeId of [...new Set(slots.map((s) => s.employeeId))]) {
        for (const rule of rules) {
          const mine = slots.filter((s) => s.employeeId === employeeId && s.ruleId === rule.id);
          if (!mine.length) continue;
          const r = oncall({ standbyAmount: rule.standbyAmount.toString(), calloutMinHours: rule.calloutMinHours.toString(), calloutRate: rule.calloutRate.toString(), multiplier: rule.multiplier.toString() }, mine.map((s) => ({ calloutHours: s.calloutHours?.toString() ?? null })));
          lines.push({ employeeId, componentCode: 'standby_allowance', amount: r.standby.toFixed(2), label: `${rule.name}: ${mine.length} on-call slots in ${month}.` });
          if (r.callouts) lines.push({ employeeId, componentCode: 'callout_pay', amount: r.callout.toFixed(2), label: `${rule.name}: ${r.callouts} call-outs (at least ${rule.calloutMinHours.toString()} hours each at ${rule.multiplier.toString()} ×).` });
        }
      }
      return this.post(tx, c, v, { kind: 'oncall', entityId, month, sourceRef: `oncall:${entityId}:${month}`, lines, title: month });
    });
  }

  // ------------------------------------------------------------------------------------------ industrial relations (PAY-9.04)

  async unions(ctx: TenantContext, user: ScopeUser, entityId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.entity(tx, c, v, entityId);
      const org = c.organizationId;
      const unions = await tx.union.findMany({ where: { organizationId: org, legalEntityId: entityId }, orderBy: { name: 'asc' } });
      const auths = await tx.unionAuthorisation.findMany({ where: { organizationId: org, legalEntityId: entityId }, orderBy: { validFrom: 'desc' } });
      const settlements = await tx.wageSettlement.findMany({ where: { organizationId: org, legalEntityId: entityId }, orderBy: { effectiveFrom: 'desc' } });
      return {
        unions: unions.map((u) => ({ id: u.id, name: u.name, registrationNo: u.registrationNo, members: auths.filter((a) => a.unionId === u.id && !a.revokedOn).length })),
        authorisations: auths.map((a) => ({ id: a.id, unionId: a.unionId, employeeId: a.employeeId, duesKind: a.duesKind, duesValue: a.duesValue.toString(), validFrom: dateOf(a.validFrom), revokedOn: a.revokedOn ? dateOf(a.revokedOn) : null })),
        settlements: settlements.map((s) => ({ id: s.id, unionId: s.unionId, title: s.title, effectiveFrom: dateOf(s.effectiveFrom), signedOn: dateOf(s.signedOn), rates: s.rates })),
      };
    });
  }

  async addUnion(ctx: TenantContext, user: ScopeUser, dto: UnionDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.entity(tx, c, v, dto.legalEntityId);
      try {
        const u = await tx.union.create({ data: { organizationId: c.organizationId, legalEntityId: dto.legalEntityId, name: dto.name, registrationNo: dto.registrationNo ?? null, createdBy: v.userId! } });
        await audit(tx, c, 'payroll.union.added', 'union', u.id, { name: dto.name });
        return { id: u.id };
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('This union is already recorded.');
        throw e;
      }
    });
  }

  /** Dues are deducted only for a worker who signed an authorisation (recorded here, one live per union). */
  async authorise(ctx: TenantContext, user: ScopeUser, dto: AuthorisationDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const ids = await entitiesFor(tx, c, v, 'payroll.special.manage');
      await payScope(tx, ids);
      const u = await tx.union.findFirst({ where: { organizationId: org, id: dto.unionId } });
      if (!u || !ids.includes(u.legalEntityId)) throw new NotFoundException('Not found');
      const e = await this.employment(tx, org, u.legalEntityId, dto.employeeId, dto.validFrom, dto.validFrom);
      try {
        const a = await tx.unionAuthorisation.create({ data: { organizationId: org, legalEntityId: u.legalEntityId, unionId: u.id, employeeId: dto.employeeId, employmentId: e.id, duesKind: dto.duesKind, duesValue: D(dto.duesValue), validFrom: asDate(dto.validFrom), createdBy: v.userId! } });
        await audit(tx, c, 'payroll.union.authorised', 'union_authorisation', a.id, { unionId: u.id, employeeId: dto.employeeId, duesKind: dto.duesKind, duesValue: dto.duesValue });
        return { id: a.id };
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new ConflictException('This worker already has a live authorisation for this union.');
        throw err;
      }
    });
  }

  async revoke(ctx: TenantContext, user: ScopeUser, id: string, revokedOn: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = await entitiesFor(tx, c, v, 'payroll.special.manage');
      await payScope(tx, ids);
      const a = await tx.unionAuthorisation.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!a || !ids.includes(a.legalEntityId)) throw new NotFoundException('Not found');
      if (a.revokedOn) throw new ConflictException('This authorisation is already withdrawn.');
      if (revokedOn < dateOf(a.validFrom)) throw new BadRequestException('It is withdrawn on or after the day it started.');
      await tx.unionAuthorisation.update({ where: { id }, data: { revokedOn: asDate(revokedOn) } });
      await audit(tx, c, 'payroll.union.revoked', 'union_authorisation', id, { revokedOn });
      return { id, revokedOn };
    });
  }

  /** The month's check-off: every authorisation live on the month's last day, on that day's basic and DA. */
  async postUnion(ctx: TenantContext, user: ScopeUser, entityId: string, month: string) {
    const v = await this.viewer(user);
    return this.posting(ctx, async (tx, c) => {
      const org = c.organizationId;
      await this.entity(tx, c, v, entityId);
      const { to } = monthRange(month);
      const auths = await tx.unionAuthorisation.findMany({ where: { organizationId: org, legalEntityId: entityId, validFrom: { lte: asDate(to) }, OR: [{ revokedOn: null }, { revokedOn: { gt: asDate(to) } }] } });
      const unions = await tx.union.findMany({ where: { organizationId: org, id: { in: [...new Set(auths.map((a) => a.unionId))] } } });
      const lines: Line[] = [];
      for (const a of auths) {
        const amount = unionDues({ duesKind: a.duesKind, duesValue: a.duesValue.toString() }, (await this.basicDa(tx, org, a.employmentId, to)).toFixed(2));
        lines.push({ employeeId: a.employeeId, componentCode: 'union_dues', amount: amount.toFixed(2), label: `${unions.find((u) => u.id === a.unionId)?.name ?? 'Union'} dues, ${month}.`, meta: { unionId: a.unionId } });
      }
      return this.post(tx, c, v, { kind: 'union', entityId, month, sourceRef: `union:${entityId}:${month}`, lines, title: `dues ${month}` });
    });
  }

  /** The union's remittance statement for a month: the members and amounts of the approved check-off. */
  async remittance(ctx: TenantContext, user: ScopeUser, unionId: string, month: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const ids = await entitiesFor(tx, c, v, 'payroll.special.manage');
      await payScope(tx, ids);
      const u = await tx.union.findFirst({ where: { organizationId: org, id: unionId } });
      if (!u || !ids.includes(u.legalEntityId)) throw new NotFoundException('Not found');
      const p = await tx.specialPosting.findFirst({ where: { organizationId: org, kind: 'union', sourceRef: `union:${u.legalEntityId}:${month}`, status: 'approved' } });
      const lines = ((p?.lines ?? []) as unknown as Line[]).filter((l) => l.meta?.unionId === u.id);
      return { union: u.name, month, approved: Boolean(p), members: lines.map((l) => ({ employeeId: l.employeeId, amount: l.amount })), total: lines.reduce((t, l) => t.add(l.amount), ZERO).toFixed(2) };
    });
  }

  async addSettlement(ctx: TenantContext, user: ScopeUser, dto: SettlementDto) {
    const v = await this.viewer(user);
    if (new Set(dto.rates.map((r) => r.category)).size !== dto.rates.length) throw new BadRequestException('Each worker category once.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.entity(tx, c, v, dto.legalEntityId);
      if (dto.unionId && !(await tx.union.findFirst({ where: { organizationId: c.organizationId, id: dto.unionId, legalEntityId: dto.legalEntityId } }))) throw new NotFoundException('Not found');
      const s = await tx.wageSettlement.create({ data: { organizationId: c.organizationId, legalEntityId: dto.legalEntityId, unionId: dto.unionId ?? null, title: dto.title, effectiveFrom: asDate(dto.effectiveFrom), signedOn: asDate(dto.signedOn), rates: dto.rates as unknown as Prisma.InputJsonValue, createdBy: v.userId! } });
      await audit(tx, c, 'payroll.settlement.added', 'wage_settlement', s.id, { title: dto.title, effectiveFrom: dto.effectiveFrom, categories: dto.rates.length });
      return { id: s.id };
    });
  }

  /**
   * Arrears of a settlement by worker category (the job's skill class), from its effective date (or joining) to the
   * month before the pay month, part months by days.
   * DECISION NEEDED: the increase from the pay month on is a salary revision made in Payroll › Compensation (not automatic).
   * shortcut: the category is today's skill class; a worker who changed class since the effective date is reviewed by hand.
   */
  async postSettlement(ctx: TenantContext, user: ScopeUser, id: string, month: string) {
    const v = await this.viewer(user);
    return this.posting(ctx, async (tx, c) => {
      const org = c.organizationId;
      const ids = await entitiesFor(tx, c, v, 'payroll.special.manage');
      await payScope(tx, ids);
      const s = await tx.wageSettlement.findFirst({ where: { organizationId: org, id } });
      if (!s || !ids.includes(s.legalEntityId)) throw new NotFoundException('Not found');
      const effective = dateOf(s.effectiveFrom);
      if (effective.slice(0, 7) >= month) throw new BadRequestException('Arrears are for months before the pay month.');
      const rates = s.rates as unknown as { category: string; monthlyIncrease: string }[];
      const plain = await tx.employeeAssignment.findMany({ where: { organizationId: org, supersededAt: null, validTo: null, skillClass: { in: rates.map((r) => r.category) } } });
      const ems = await tx.employment.findMany({ where: { organizationId: org, legalEntityId: s.legalEntityId, id: { in: plain.map((a) => a.employmentId) }, joinedOn: { lt: monthStart(month) }, OR: [{ exitedOn: null }, { exitedOn: { gte: monthStart(month) } }] }, select: { id: true, employeeId: true, joinedOn: true } });
      const asgs = plain.filter((a) => ems.some((e) => e.id === a.employmentId)).map((a) => ({ ...a, employment: ems.find((e) => e.id === a.employmentId)! }));
      const lines: Line[] = [];
      for (const a of asgs) {
        const rate = rates.find((r) => r.category === a.skillClass)!;
        const from = dateOf(a.employment.joinedOn) > effective ? dateOf(a.employment.joinedOn) : effective;
        const x = settlementArrears(rate.monthlyIncrease, from, month);
        lines.push({ employeeId: a.employment.employeeId, componentCode: 'settlement_arrears', amount: x.total.toFixed(2), label: `${s.title}: ₹${rate.monthlyIncrease} a month for ${a.skillClass} from ${from} to the end of the month before ${month}.` });
      }
      return this.post(tx, c, v, { kind: 'settle', entityId: s.legalEntityId, month, sourceRef: `settle:${s.id}`, lines, title: s.title });
    });
  }

  async addLayoff(ctx: TenantContext, user: ScopeUser, entityId: string, dto: LayoffDto) {
    const v = await this.viewer(user);
    if (Number(dto.days) > monthDays(dto.month)) throw new BadRequestException(`${dto.month} has ${monthDays(dto.month)} days.`);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      await this.entity(tx, c, v, entityId);
      const { from, to } = monthRange(dto.month);
      const e = await this.employment(tx, org, entityId, dto.employeeId, from, to);
      const row = await tx.layoffDays.upsert({
        where: { organizationId_employmentId_month: { organizationId: org, employmentId: e.id, month: monthStart(dto.month) } },
        create: { organizationId: org, legalEntityId: entityId, employeeId: dto.employeeId, employmentId: e.id, month: monthStart(dto.month), days: D(dto.days), createdBy: v.userId! },
        update: { days: D(dto.days), createdBy: v.userId! },
      });
      await audit(tx, c, 'payroll.layoff.days_saved', 'layoff_days', row.id, { employeeId: dto.employeeId, month: dto.month, days: dto.days });
      return { id: row.id };
    });
  }

  /** Lay-off compensation at the IR Code share (P07 IN.LAYOFF) of the basic and DA for the days. */
  async postLayoff(ctx: TenantContext, user: ScopeUser, entityId: string, month: string) {
    const v = await this.viewer(user);
    return this.posting(ctx, async (tx, c) => {
      const org = c.organizationId;
      await this.entity(tx, c, v, entityId);
      const { to } = monthRange(month);
      const rs = inForce(await this.rules.published(), 'IN.LAYOFF', ['IN'], to);
      if (!rs) throw new ConflictException(`No published lay-off rule is in force on ${to}.`);
      const rows = await tx.layoffDays.findMany({ where: { organizationId: org, legalEntityId: entityId, month: monthStart(month) } });
      const lines: Line[] = [];
      for (const r of rows) {
        const x = layoffRule(rs, { basicDaMonthly: await this.basicDa(tx, org, r.employmentId, to), days: Number(r.days), monthDays: monthDays(month) });
        lines.push({ employeeId: r.employeeId, componentCode: 'layoff_comp', amount: x.amount.toFixed(2), label: `Lay-off compensation for ${r.days.toString()} days at ${Number(x.share) * 100} % of basic and DA (${rs.statute} ${rs.version}).` });
      }
      return this.post(tx, c, v, { kind: 'layoff', entityId, month, sourceRef: `layoff:${entityId}:${month}`, lines, title: month });
    });
  }

  /** A VRS payout: exempt up to what is left of the lifetime limit (P07 IN.TAXDED), the rest taxed as salary. */
  async addVrs(ctx: TenantContext, user: ScopeUser, entityId: string, dto: VrsDto) {
    const v = await this.viewer(user);
    return this.posting(ctx, async (tx, c) => {
      const org = c.organizationId;
      await this.entity(tx, c, v, entityId);
      const { from, to } = monthRange(dto.month);
      const e = await this.employment(tx, org, entityId, dto.employeeId, from, to);
      const rs = inForce(await this.rules.published(), 'IN.TAXDED', ['IN'], to);
      const limit = (rs?.values as { vrsMax?: string } | undefined)?.vrsMax;
      if (!rs || !limit) throw new ConflictException(`No published VRS exemption limit is in force on ${to}.`);
      const x = vrsSplit(dto.amount, limit, dto.priorExemption);
      try {
        await tx.vrsPayout.create({ data: { organizationId: org, legalEntityId: entityId, employeeId: dto.employeeId, employmentId: e.id, month: monthStart(dto.month), amount: D(dto.amount), priorExemption: D(dto.priorExemption), exempt: x.exempt, taxable: x.taxable, ruleVersion: rs.version, createdBy: v.userId! } });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new ConflictException('This employment already has a VRS payout.');
        throw err;
      }
      const lines: Line[] = [
        { employeeId: dto.employeeId, componentCode: 'vrs_exempt', amount: x.exempt.toFixed(2), label: `VRS compensation, exempt up to the lifetime limit (${rs.statute} ${rs.version}).` },
        { employeeId: dto.employeeId, componentCode: 'vrs_taxable', amount: x.taxable.toFixed(2), label: 'VRS compensation above the exempt limit, taxed as salary.' },
      ];
      return this.post(tx, c, v, { kind: 'vrs', entityId, month: dto.month, sourceRef: `vrs:${e.id}`, lines, title: dto.month });
    });
  }
}
