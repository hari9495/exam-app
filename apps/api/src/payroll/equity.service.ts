import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import type { ScopeUser } from '../access/scope';
import { asDate, dateOf } from '../time/time-core';
import { ApprovalsEngine } from '../workflow/approvals-engine.service';
import type { EquityPlanDto, ExerciseDto, GrantDto, ValuationDto } from './dto-5i';
import { entitiesFor, payHolders, payScope, payViewer, requireEntity, requireSelf, withPayScope } from './pay-access';
import { SpecialPayError, esopPerquisite, vestingSchedule } from './special';
import { taxYearOf } from './tax';

// Batch 5i, PAY-9.09 equity (M03 YX-PAY-46, YX-TAX-18, C4). Plans with a pool; valuations (fair market value per unit by
// date); grants approved through P03 within the pool, vesting by their schedule (time, or milestones confirmed by
// someone else); exercises of vested units (within the post-exit window after leaving) approved through P03, whose
// perquisite goes to the payroll tax projection; unvested units lapse on exit; a cap table per plan.
// DECISION NEEDED: the tax deferral for eligible start-ups (YX-TAX-18), SAR cash settlement, sales, and the grant
// letter by e-sign (P05) are not built; every exercise is taxed in its month through the projection.

export const EQUITY_GRANT = 'payroll.equity_grant';
export const EQUITY_EXERCISE = 'payroll.equity_exercise';
const SYSTEM = '00000000-0000-0000-0000-000000000000';
const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);
type Grant = Prisma.EquityGrantGetPayload<object>;
type Event = Prisma.VestingEventGetPayload<object>;

@Injectable()
export class EquityService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly engine: ApprovalsEngine,
  ) {}

  onModuleInit() {
    this.engine.register({ key: EQUITY_GRANT, label: 'Equity grant', risk: 'normal', autoActions: false, distinctSteps: true, onDecided: (tx, req, o) => this.grantDecided(tx, req, o), requesterLink: () => '/yx/payroll/equity' });
    this.engine.register({ key: EQUITY_EXERCISE, label: 'Equity exercise', risk: 'normal', autoActions: false, distinctSteps: true, onDecided: (tx, req, o) => this.exerciseDecided(tx, req, o), requesterLink: () => '/yx/me/equity' });
  }

  private async viewer(user: ScopeUser) {
    const v = await payViewer(this.prisma, this.tenantPrisma, user);
    requireSelf(v);
    return v;
  }

  /** Vested, lapsed or still to vest, today: time events vest on their date; anything after the leaving day lapses. */
  private state(e: Event, exitedOn: string | null, today: string): 'vested' | 'lapsed' | 'scheduled' {
    if (e.status === 'lapsed') return 'lapsed';
    if (e.kind === 'milestone') return e.status === 'vested' ? 'vested' : exitedOn && exitedOn < today ? 'lapsed' : 'scheduled';
    const on = dateOf(e.vestOn);
    if (exitedOn && on > exitedOn) return 'lapsed';
    return on <= today ? 'vested' : 'scheduled';
  }

  private async grantView(tx: Tx, org: string, g: Grant, today = todayIst()) {
    const em = await tx.employment.findFirst({ where: { organizationId: org, id: g.employmentId }, select: { exitedOn: true } });
    const exitedOn = em?.exitedOn ? dateOf(em.exitedOn) : null;
    const events = await tx.vestingEvent.findMany({ where: { organizationId: org, grantId: g.id }, orderBy: { vestOn: 'asc' } });
    const exercises = await tx.equityExercise.findMany({ where: { organizationId: org, grantId: g.id }, orderBy: { createdAt: 'desc' } });
    const sum = (s: string) => events.filter((e) => this.state(e, exitedOn, today) === s).reduce((t, e) => t + e.units, 0);
    const exercised = exercises.filter((x) => x.status !== 'rejected').reduce((t, x) => t + x.units, 0);
    return {
      id: g.id,
      planId: g.planId,
      employeeId: g.employeeId,
      grantedOn: dateOf(g.grantedOn),
      units: g.units,
      exercisePrice: g.exercisePrice.toString(),
      status: g.status,
      vested: sum('vested'),
      unvested: sum('scheduled'),
      lapsed: sum('lapsed'),
      exercised,
      exercisable: Math.max(0, sum('vested') - exercised),
      exitedOn,
      events: events.map((e) => ({ id: e.id, vestOn: dateOf(e.vestOn), units: e.units, kind: e.kind, milestone: e.milestone, state: this.state(e, exitedOn, today) })),
      exercises: exercises.map((x) => ({ id: x.id, exercisedOn: dateOf(x.exercisedOn), units: x.units, pricePayable: x.pricePayable.toFixed(2), fmv: x.fmv?.toString() ?? null, perquisite: x.perquisite?.toFixed(2) ?? null, status: x.status, paymentRef: x.paymentRef })),
    };
  }

  // ------------------------------------------------------------------------------------------ plans, valuations, grants

  async overview(ctx: TenantContext, user: ScopeUser, entityId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      await requireEntity(tx, c, v, 'payroll.equity.manage', entityId);
      await payScope(tx, [entityId]);
      const plans = await tx.equityPlan.findMany({ where: { organizationId: org, legalEntityId: entityId }, orderBy: { name: 'asc' } });
      const valuations = await tx.equityValuation.findMany({ where: { organizationId: org, legalEntityId: entityId }, orderBy: { valuedOn: 'desc' }, take: 20 });
      const grants = await tx.equityGrant.findMany({ where: { organizationId: org, legalEntityId: entityId }, orderBy: { grantedOn: 'desc' } });
      const views = [];
      for (const g of grants) views.push({ ...(await this.grantView(tx, org, g)), madeByMe: g.createdBy === v.userId });
      return {
        plans: plans.map((p) => {
          const used = grants.filter((g) => g.planId === p.id && ['pending', 'active'].includes(g.status)).reduce((t, g) => t + g.units, 0);
          return { id: p.id, name: p.name, kind: p.kind, poolUnits: p.poolUnits, granted: used, available: p.poolUnits - used, exitWindowDays: p.exitWindowDays, status: p.status };
        }),
        valuations: valuations.map((x) => ({ id: x.id, valuedOn: dateOf(x.valuedOn), fmv: x.fmv.toString(), basis: x.basis })),
        grants: views,
      };
    });
  }

  async addPlan(ctx: TenantContext, user: ScopeUser, dto: EquityPlanDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await requireEntity(tx, c, v, 'payroll.equity.manage', dto.legalEntityId);
      await payScope(tx, [dto.legalEntityId]);
      const p = await tx.equityPlan.create({ data: { organizationId: c.organizationId, legalEntityId: dto.legalEntityId, name: dto.name, kind: dto.kind, poolUnits: dto.poolUnits, exitWindowDays: dto.exitWindowDays, createdBy: v.userId! } });
      await audit(tx, c, 'payroll.equity.plan_added', 'equity_plan', p.id, { name: dto.name, kind: dto.kind, pool: dto.poolUnits });
      return { id: p.id };
    });
  }

  async addValuation(ctx: TenantContext, user: ScopeUser, dto: ValuationDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await requireEntity(tx, c, v, 'payroll.equity.manage', dto.legalEntityId);
      await payScope(tx, [dto.legalEntityId]);
      try {
        const x = await tx.equityValuation.create({ data: { organizationId: c.organizationId, legalEntityId: dto.legalEntityId, valuedOn: asDate(dto.valuedOn), fmv: D(dto.fmv), basis: dto.basis, createdBy: v.userId! } });
        await audit(tx, c, 'payroll.equity.valuation_added', 'equity_valuation', x.id, { valuedOn: dto.valuedOn, fmv: dto.fmv, basis: dto.basis });
        return { id: x.id };
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('There is already a valuation on that day.');
        throw e;
      }
    });
  }

  private async approvers(tx: Tx, org: string, entityId: string, not: (string | null)[]) {
    return (await payHolders(tx, org, 'payroll.equity.manage', entityId, todayIst())).filter((u) => !not.includes(u));
  }

  /** A grant within the plan's unallocated pool, sent for approval; its vesting events are made once it is approved. */
  async grant(ctx: TenantContext, user: ScopeUser, dto: GrantDto) {
    const v = await this.viewer(user);
    const milestoneUnits = (dto.milestones ?? []).reduce((t, m) => t + m.units, 0);
    if (milestoneUnits > dto.units) throw new BadRequestException('Milestones vest at most the units granted.');
    try {
      vestingSchedule(dto.grantedOn, dto.units - milestoneUnits, dto.cliffMonths, dto.vestingMonths, dto.everyMonths);
    } catch (e) {
      if (e instanceof SpecialPayError) throw new BadRequestException(e.message);
      throw e;
    }
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const ids = await entitiesFor(tx, c, v, 'payroll.equity.manage');
      await payScope(tx, ids);
      await tx.$queryRaw`SELECT id FROM equity_plans WHERE organization_id = ${org}::uuid AND id = ${dto.planId}::uuid FOR UPDATE`;
      const p = await tx.equityPlan.findFirst({ where: { organizationId: org, id: dto.planId } });
      if (!p || !ids.includes(p.legalEntityId)) throw new NotFoundException('Not found');
      if (p.status !== 'active') throw new ConflictException('This plan is closed.');
      const used = await tx.equityGrant.aggregate({ where: { organizationId: org, planId: p.id, status: { in: ['pending', 'active'] } }, _sum: { units: true } });
      if ((used._sum.units ?? 0) + dto.units > p.poolUnits) throw new ConflictException(`The plan's pool has ${p.poolUnits - (used._sum.units ?? 0)} units left.`);
      const em = await tx.employment.findFirst({ where: { organizationId: org, legalEntityId: p.legalEntityId, employeeId: dto.employeeId, joinedOn: { lte: asDate(dto.grantedOn) }, OR: [{ exitedOn: null }, { exitedOn: { gte: asDate(dto.grantedOn) } }] }, orderBy: { joinedOn: 'desc' } });
      if (!em) throw new NotFoundException('This person has no employment in this legal entity then.');
      const grantee = (await tx.employee.findFirst({ where: { organizationId: org, id: dto.employeeId }, select: { userId: true } }))?.userId ?? null;
      if (grantee === v.userId) throw new ForbiddenException('Someone else makes your own grant.');
      const approvers = await this.approvers(tx, org, p.legalEntityId, [v.userId, grantee]);
      if (!approvers.length) throw new BadRequestException('No one can approve this yet. A second person needs "payroll.equity.manage".');
      const schedule = { cliffMonths: dto.cliffMonths, vestingMonths: dto.vestingMonths, everyMonths: dto.everyMonths, milestones: dto.milestones ?? [] };
      const g = await tx.equityGrant.create({ data: { organizationId: org, legalEntityId: p.legalEntityId, planId: p.id, employeeId: dto.employeeId, employmentId: em.id, grantedOn: asDate(dto.grantedOn), units: dto.units, exercisePrice: D(dto.exercisePrice), schedule: schedule as unknown as Prisma.InputJsonValue, createdBy: v.userId! } });
      const sub = await this.engine.submit(tx, c, { type: EQUITY_GRANT, subjectType: 'equity_grant', subjectId: g.id, title: `${p.name}: ${dto.units} units`, summary: [{ label: 'Granted on', value: dto.grantedOn }, { label: 'Exercise price', value: `₹${dto.exercisePrice}` }, { label: 'Vesting', value: `${dto.vestingMonths} months, cliff ${dto.cliffMonths}` }], subjectPersonId: dto.employeeId, requesterUserId: v.userId!, raisedByUserId: v.userId!, steps: [{ name: 'Equity approval', approvers: [{ kind: 'users', userIds: approvers }], mode: 'any', remindAfterHours: 24 }], payload: {}, payloadFields: [], fallbackUserIds: [] });
      await tx.equityGrant.update({ where: { id: g.id }, data: { wfRequestId: sub.id } });
      await audit(tx, c, 'payroll.equity.granted', 'equity_grant', g.id, { planId: p.id, employeeId: dto.employeeId, units: dto.units, price: dto.exercisePrice });
      return { result: { id: g.id, status: 'pending', requestId: sub.id }, notices: sub.notices };
    });
    await this.engine.send(ctx, out.notices);
    return out.result;
  }

  private async openAll(tx: Tx, org: string) {
    await payScope(
      tx,
      (await tx.legalEntity.findMany({ where: { organizationId: org }, select: { id: true } })).map((e) => e.id),
    );
  }

  private async grantDecided(tx: Tx, wf: Prisma.WfRequestGetPayload<object>, outcome: 'approved' | 'rejected') {
    const org = wf.organizationId;
    await this.openAll(tx, org);
    const g = await tx.equityGrant.findFirst({ where: { organizationId: org, id: wf.subjectId, status: 'pending' } });
    if (!g) return;
    if (outcome === 'approved') {
      const s = g.schedule as unknown as { cliffMonths: number; vestingMonths: number; everyMonths: number; milestones: { milestone: string; units: number }[] };
      const timeUnits = g.units - s.milestones.reduce((t, m) => t + m.units, 0);
      const events = [
        ...vestingSchedule(dateOf(g.grantedOn), timeUnits, s.cliffMonths, s.vestingMonths, s.everyMonths).map((x) => ({ vestOn: asDate(x.vestOn), units: x.units, kind: 'time', milestone: null })),
        ...s.milestones.map((m) => ({ vestOn: g.grantedOn, units: m.units, kind: 'milestone', milestone: m.milestone })),
      ];
      await tx.vestingEvent.createMany({ data: events.map((e) => ({ organizationId: org, legalEntityId: g.legalEntityId, grantId: g.id, employeeId: g.employeeId, ...e })) });
    }
    await tx.equityGrant.update({ where: { id: g.id }, data: { status: outcome === 'approved' ? 'active' : 'rejected' } });
    await audit(tx, { organizationId: org, isSuperAdmin: false } as CompanyContext, `payroll.equity.grant_${outcome}`, 'equity_grant', g.id, {});
  }

  /** A milestone is confirmed by someone other than the grant's maker and the grantee. */
  async confirmMilestone(ctx: TenantContext, user: ScopeUser, eventId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const ids = await entitiesFor(tx, c, v, 'payroll.equity.manage');
      await payScope(tx, ids);
      const e = await tx.vestingEvent.findFirst({ where: { organizationId: org, id: eventId } });
      if (!e || !ids.includes(e.legalEntityId)) throw new NotFoundException('Not found');
      if (e.kind !== 'milestone' || e.status !== 'scheduled') throw new ConflictException('Only a milestone still to vest is confirmed.');
      const g = await tx.equityGrant.findFirstOrThrow({ where: { organizationId: org, id: e.grantId } });
      const grantee = (await tx.employee.findFirst({ where: { organizationId: org, id: g.employeeId }, select: { userId: true } }))?.userId ?? null;
      if (g.createdBy === v.userId || grantee === v.userId) throw new ForbiddenException('Someone other than the grant\'s maker and the grantee confirms a milestone.');
      const em = await tx.employment.findFirst({ where: { organizationId: org, id: g.employmentId }, select: { exitedOn: true } });
      if (em?.exitedOn && dateOf(em.exitedOn) < todayIst()) throw new ConflictException('The grantee has left: unvested units lapsed.');
      await tx.vestingEvent.update({ where: { id: e.id }, data: { status: 'vested', vestOn: asDate(todayIst()), confirmedBy: v.userId!, confirmedAt: new Date() } });
      await audit(tx, c, 'payroll.equity.milestone_confirmed', 'vesting_event', e.id, { grantId: g.id, units: e.units, milestone: e.milestone });
      return { id: e.id, status: 'vested' };
    });
  }

  /** The cap table of a plan: per grant, granted, vested, exercised, unvested and lapsed; the pool left (CSV). */
  async capTable(ctx: TenantContext, user: ScopeUser, planId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const ids = await entitiesFor(tx, c, v, 'payroll.equity.manage');
      await payScope(tx, ids);
      const p = await tx.equityPlan.findFirst({ where: { organizationId: org, id: planId } });
      if (!p || !ids.includes(p.legalEntityId)) throw new NotFoundException('Not found');
      const grants = await tx.equityGrant.findMany({ where: { organizationId: org, planId, status: 'active' }, orderBy: { grantedOn: 'asc' } });
      const codes = await tx.employment.findMany({ where: { organizationId: org, id: { in: grants.map((g) => g.employmentId) } }, select: { id: true, employeeCode: true } });
      const rows = [['employee_code', 'granted_on', 'units', 'exercise_price', 'vested', 'exercised', 'unvested', 'lapsed'].join(',')];
      let used = 0;
      for (const g of grants) {
        const x = await this.grantView(tx, org, g);
        used += g.units;
        rows.push([codes.find((e) => e.id === g.employmentId)?.employeeCode ?? '', x.grantedOn, x.units, x.exercisePrice, x.vested, x.exercised, x.unvested, x.lapsed].join(','));
      }
      rows.push(['POOL LEFT', '', p.poolUnits - used, '', '', '', '', ''].join(','));
      await audit(tx, c, 'payroll.equity.cap_table_exported', 'equity_plan', p.id, { grants: grants.length });
      return { file: Buffer.from(rows.join('\r\n') + '\r\n'), name: `cap-table-${p.name.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}.csv`, contentType: 'text/csv' };
    });
  }

  async markPaid(ctx: TenantContext, user: ScopeUser, exerciseId: string, reference: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = await entitiesFor(tx, c, v, 'payroll.equity.manage');
      await payScope(tx, ids);
      const x = await tx.equityExercise.findFirst({ where: { organizationId: c.organizationId, id: exerciseId } });
      if (!x || !ids.includes(x.legalEntityId)) throw new NotFoundException('Not found');
      if (x.status !== 'approved') throw new ConflictException('Only an approved exercise is marked paid.');
      await tx.equityExercise.update({ where: { id: x.id }, data: { status: 'paid', paymentRef: reference } });
      await audit(tx, c, 'payroll.equity.exercise_paid', 'equity_exercise', x.id, { reference });
      return { id: x.id, status: 'paid' };
    });
  }

  // ------------------------------------------------------------------------------------------ the person's side

  async mine(ctx: TenantContext, user: ScopeUser) {
    await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await payScope(tx, []);
      const org = c.organizationId;
      const grants = await tx.equityGrant.findMany({ where: { organizationId: org, status: 'active' }, orderBy: { grantedOn: 'desc' } });
      const out = [];
      for (const g of grants) {
        const plan = await withPayScope(tx, [g.legalEntityId], () => tx.equityPlan.findFirst({ where: { organizationId: org, id: g.planId }, select: { name: true, kind: true, exitWindowDays: true } }));
        out.push({ ...(await this.grantView(tx, org, g)), plan });
      }
      return out;
    });
  }

  /** The person asks to exercise vested units (after leaving, only within the plan's window); payroll approves. */
  async exercise(ctx: TenantContext, user: ScopeUser, dto: ExerciseDto) {
    const v = await this.viewer(user);
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      await payScope(tx, []);
      const g = await tx.equityGrant.findFirst({ where: { organizationId: org, id: dto.grantId, status: 'active' } });
      if (!g) throw new NotFoundException('Not found');
      const [{ ids }] = await tx.$queryRaw<{ ids: string[] }[]>`SELECT app_current_employee_ids()::text[] AS ids`;
      if (!(ids ?? []).includes(g.employeeId)) throw new NotFoundException('Not found');
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`equity:${g.id}`}))`;
      const today = todayIst();
      const view = await this.grantView(tx, org, g, today);
      const plan = await withPayScope(tx, [g.legalEntityId], () => tx.equityPlan.findFirstOrThrow({ where: { organizationId: org, id: g.planId } }));
      if (view.exitedOn) {
        const last = new Date(asDate(view.exitedOn).getTime() + plan.exitWindowDays * 86_400_000).toISOString().slice(0, 10);
        if (today > last) throw new ConflictException(`The window to exercise after leaving ended on ${last}.`);
      }
      if (dto.units > view.exercisable) throw new BadRequestException(`You can exercise up to ${view.exercisable} vested units.`);
      const approvers = await withPayScope(tx, [g.legalEntityId], () => this.approvers(tx, org, g.legalEntityId, [v.userId]));
      if (!approvers.length) throw new BadRequestException('No one can approve this yet.');
      const x = await tx.equityExercise.create({ data: { organizationId: org, legalEntityId: g.legalEntityId, grantId: g.id, employeeId: g.employeeId, employmentId: g.employmentId, exercisedOn: asDate(today), units: dto.units, pricePayable: g.exercisePrice.mul(dto.units).toDecimalPlaces(2) } });
      const sub = await this.engine.submit(tx, c, { type: EQUITY_EXERCISE, subjectType: 'equity_exercise', subjectId: x.id, title: `Exercise ${dto.units} units (${plan.name})`, summary: [{ label: 'Price payable', value: `₹${x.pricePayable.toFixed(2)}` }], subjectPersonId: g.employeeId, requesterUserId: v.userId!, raisedByUserId: v.userId!, steps: [{ name: 'Equity approval', approvers: [{ kind: 'users', userIds: approvers }], mode: 'any', remindAfterHours: 24 }], payload: {}, payloadFields: [], fallbackUserIds: [] });
      await withPayScope(tx, [g.legalEntityId], () => tx.equityExercise.update({ where: { id: x.id }, data: { wfRequestId: sub.id } }));
      await audit(tx, c, 'payroll.equity.exercise_requested', 'equity_exercise', x.id, { grantId: g.id, units: dto.units });
      return { result: { id: x.id, status: 'requested', pricePayable: x.pricePayable.toFixed(2) }, notices: sub.notices };
    });
    await this.engine.send(ctx, out.notices);
    return out.result;
  }

  /** Approved: the perquisite at the fair market value on the exercise date goes to the tax projection (perquisites). */
  private async exerciseDecided(tx: Tx, wf: Prisma.WfRequestGetPayload<object>, outcome: 'approved' | 'rejected') {
    const org = wf.organizationId;
    await this.openAll(tx, org);
    const x = await tx.equityExercise.findFirst({ where: { organizationId: org, id: wf.subjectId, status: 'requested' } });
    if (!x) return;
    const c = { organizationId: org, isSuperAdmin: false } as CompanyContext;
    if (outcome === 'rejected') {
      await tx.equityExercise.update({ where: { id: x.id }, data: { status: 'rejected' } });
      await audit(tx, c, 'payroll.equity.exercise_rejected', 'equity_exercise', x.id, {});
      return;
    }
    const on = dateOf(x.exercisedOn);
    const val = await tx.equityValuation.findFirst({ where: { organizationId: org, legalEntityId: x.legalEntityId, valuedOn: { lte: x.exercisedOn } }, orderBy: { valuedOn: 'desc' } });
    if (!val) throw new ConflictException(`No valuation on or before ${on}: add the fair market value first.`);
    const g = await tx.equityGrant.findFirstOrThrow({ where: { organizationId: org, id: x.grantId } });
    const perq = esopPerquisite(val.fmv.toString(), g.exercisePrice.toString(), x.units);
    const p = await tx.perquisite.create({ data: { organizationId: org, legalEntityId: x.legalEntityId, employeeId: x.employeeId, employmentId: x.employmentId, taxYear: taxYearOf(on.slice(0, 7)), kind: 'esop', annualValue: perq, description: `ESOP exercise of ${x.units} units on ${on}: (FMV ₹${val.fmv.toString()} − price ₹${g.exercisePrice.toString()}) × ${x.units}.`.slice(0, 300), enteredBy: SYSTEM } });
    await tx.equityExercise.update({ where: { id: x.id }, data: { status: 'approved', fmv: val.fmv, perquisite: perq, perquisiteId: p.id } });
    await audit(tx, c, 'payroll.equity.exercise_approved', 'equity_exercise', x.id, { fmv: val.fmv.toString(), perquisite: perq.toFixed(2), valuation: dateOf(val.valuedOn) });
  }

}
