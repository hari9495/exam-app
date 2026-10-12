import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import type { ScopeUser, Viewer } from '../access/scope';
import { REDIS_CONNECTION, logBullErrors } from '../jobs/redis-connection';
import { StatutoryRulesService } from '../statutory/statutory.service';
import { StatutoryError, empDefaults, esiCovered, inForce, type RuleSet } from '../statutory/evaluator';
import { asDate, dateOf, monthRange } from '../time/time-core';
import { subPeriods } from './frequency';
import { addDays } from '../time/time-maths';
import { PeriodsService as TimePeriodsService } from '../time/periods.service';
import { ApprovalsEngine, type Notice, type StepSpec } from '../workflow/approvals-engine.service';
import { ENGINE_VERSION, calculatePayslip, hashOf, type CalcComponent, type Segment, type Snapshot } from './calc';
import type { ConfirmationDto } from './dto';
import { principalPart } from './inputs.service';
import { buildTaxInputs } from './tax.service';
import { taxYearOf } from './tax';
import { PayKey, entitiesFor, payHolders, payScope, payViewer, requireEntity, requireSelf, systemAdmins, withPayScope } from './pay-access';

// Payroll runs (M03-BUILD-DESIGN §3.2, §9, PAY-3.01 … 3.10, 3.18): create per pay group and month; validations with
// waivers (YX-PAY-05); calculate by fan-out on BullMQ with per-employee progress (an advisory lock keeps one calculation
// of a run at a time, job ids make retries idempotent); variance review (YX-PAY-06); submit as a P03 request decided on the
// run's own page (maker ≠ checker, step-up, typed confirmation); the final approval approves the payslips, locks the month
// and settles recoveries in one transaction; void keeps everything; reproduce re-runs a payslip from its snapshot.
// Batch 5g: off-cycle runs (bonus, arrears, correction, payment, F&F) use the same engine, approval and lock rules but
// never count as the regular payslip (YX-PAY-04): they pay the items attached to them (an F&F run also the salary to the
// last day), never freeze or lock the month, and do not revise the regular payslip.

export const RUN = 'payroll.run';
const QUEUE = 'payroll-calc';
const CHUNK = 100;
// The run-level steps (checks, queueing, finishing, submitting) read and write for everyone in the run in one
// transaction: a batch whose size is the run's, so a large run gets longer than the 5-second default (5j-D1).
const RUN_TX = { timeout: 600_000 };
// The first person in a chunk also reads for the whole chunk (ChunkReads), which can pass 5 seconds when chunks run side by side.
const PERSON_TX = { timeout: 60_000 };
// PAY-10.08 load test: chunks are worked on side by side (each person is its own transaction, so they never meet).
const CONCURRENCY = Number(process.env.PAYROLL_CALC_CONCURRENCY ?? 8);
const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);
const monthText = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const VIEW: PayKey[] = ['payroll.run.view', 'payroll.run.prepare', 'payroll.run.approve'];
export const approvePhrase = (shortName: string, month: string) => `APPROVE ${shortName.toUpperCase()} ${month}`;

type Run = Prisma.PayrollRunGetPayload<object>;
export type OffcycleKind = 'bonus' | 'arrears' | 'correction' | 'payment';
type Member = { employmentId: string; employeeId: string; joinedOn: Date; exitedOn: Date | null; employeeCode: string; name: string; userId: string | null };

/**
 * Founder decision 5j-D1 (12 Oct 2026): what a chunk of people needs is read once for the whole chunk (the run's group,
 * period and options, everyone's salaries, packages, jobs, inputs and recoveries) and shared by the people in it, who are
 * still each saved in their own transaction. Without a chunk (arrears, one person) it is simply a chunk of one.
 */
export class ChunkReads {
  private readonly memo = new Map<string, Promise<unknown>>();
  constructor(readonly employmentIds: string[]) {}
  once<T>(key: string, read: () => Promise<T>): Promise<T> {
    let p = this.memo.get(key) as Promise<T> | undefined;
    if (!p) {
      p = read();
      this.memo.set(key, p);
      p.catch(() => this.memo.delete(key));
    }
    return p;
  }
}

class NotReady extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

@Injectable()
export class PayRunsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PayRunsService.name);
  private readonly queue: Queue;
  private worker: Worker | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly engine: ApprovalsEngine,
    private readonly rules: StatutoryRulesService,
    private readonly moduleRef: ModuleRef,
    @Inject(REDIS_CONNECTION) private readonly connection: Redis,
  ) {
    this.queue = logBullErrors(new Queue(QUEUE, { connection }), QUEUE);
  }

  onModuleInit() {
    this.engine.register({
      key: RUN,
      label: 'Approve a payroll run',
      risk: 'high',
      autoActions: false,
      decideOnlyVia: '/yx/payroll/runs',
      distinctSteps: true,
      onDecided: (tx, req, outcome) => this.decided(tx, req, outcome),
      requesterLink: () => '/yx/payroll/runs',
    });
    this.worker = logBullErrors(new Worker(QUEUE, (job) => this.calculateChunk(job.data as { org: string; runId: string; version: number; ids: string[] }), { connection: this.connection, concurrency: CONCURRENCY }), QUEUE);
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue.close();
  }

  private async viewer(user: ScopeUser) {
    const v = await payViewer(this.prisma, this.tenantPrisma, user);
    requireSelf(v);
    return v;
  }

  /** A run the keys reach (the pay guard is opened to those entities only); anything else is "not found". */
  private async runIn(tx: Tx, c: CompanyContext, v: Viewer, id: string, keys: PayKey[]) {
    const ids = [...new Set((await Promise.all(keys.map((k) => entitiesFor(tx, c, v, k)))).flat())];
    await payScope(tx, ids);
    const run = await tx.payrollRun.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!run || !ids.includes(run.legalEntityId)) throw new NotFoundException('Not found');
    return run;
  }

  /** The run's legal entity for system work (the job, the approval): a definer function that returns only the entity. */
  private async entityOfRun(tx: Tx, org: string, runId: string): Promise<string> {
    const [x] = await tx.$queryRaw<{ id: string | null }[]>`SELECT payroll_run_entity(${org}::uuid, ${runId}::uuid)::text AS id`;
    if (!x?.id) throw new NotFoundException('No such run.');
    return x.id;
  }

  private month(run: Run) {
    return dateOf(run.periodStart).slice(0, 7);
  }

  // ------------------------------------------------------------------------------------------ create, list, read (PAY-3.01)

  async create(ctx: TenantContext, user: ScopeUser, payGroupId: string, month: string, kind: OffcycleKind | null = null, subPeriod: number | null = null) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const g = await tx.payGroup.findFirst({ where: { organizationId: c.organizationId, id: payGroupId, status: 'active' } });
      if (!g) throw new NotFoundException('Not found');
      await requireEntity(tx, c, v, kind ? 'payroll.offcycle.prepare' : 'payroll.run.prepare', g.legalEntityId);
      await payScope(tx, [g.legalEntityId]);
      // PAY-9.10: a legal entity outside India is paid only once its country pack is switched on (YX-PAY-43).
      const entity = await tx.legalEntity.findFirstOrThrow({ where: { organizationId: c.organizationId, id: g.legalEntityId }, select: { country: true } });
      if (entity.country !== 'IN' && !(await tx.entityCountryPack.findFirst({ where: { organizationId: c.organizationId, legalEntityId: g.legalEntityId, country: entity.country } }))) throw new ConflictException(`Switch on the ${entity.country} country pack for this legal entity before its first payroll.`);
      const { from, to } = monthRange(month);
      // PAY-9.01: a weekly or fortnightly group's regular runs are one per period of the month (sub-period 1, 2 …).
      const periodic = g.frequency !== 'monthly' && !kind;
      if (periodic !== (subPeriod !== null)) throw new BadRequestException(periodic ? 'Choose which pay period of the month this run is for.' : 'Only the regular runs of a weekly or fortnightly group have pay periods.');
      const sub = periodic ? subPeriods(g.frequency as 'weekly' | 'fortnightly', dateOf(g.anchorDate!), month).find((x) => x.k === subPeriod) : null;
      if (periodic && !sub) throw new BadRequestException(`${monthText(month)} has no pay period ${subPeriod} for this group.`);
      const p = await tx.payPeriod.findFirst({ where: { organizationId: c.organizationId, legalEntityId: g.legalEntityId, payGroupId: null, periodStart: asDate(from) } });
      // An off-cycle run pays after the month is locked; only the regular run is refused then.
      if (!kind && (p?.lockedByRunId || p?.stage === 'filed')) throw new ConflictException(`${monthText(month)} is already paid and locked for this legal entity.`);
      try {
        const run = await tx.payrollRun.create({ data: { organizationId: c.organizationId, legalEntityId: g.legalEntityId, payGroupId, periodStart: asDate(from), periodEnd: asDate(sub ? sub.to : to), ...(sub ? { subPeriod: sub.k, rangeStart: asDate(sub.from) } : {}), preparedBy: v.userId!, ...(kind ? { runType: 'offcycle', offcycleKind: kind } : {}) } });
        await audit(tx, c, 'payroll.run.created', 'payroll_run', run.id, { payGroupId, month, offcycle: kind, subPeriod: sub ? { k: sub.k, from: sub.from, to: sub.to } : null });
        return this.view(run);
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(`${g.name} already has a payroll for ${sub ? `${sub.from} to ${sub.to}` : monthText(month)}.`);
        throw e;
      }
    });
  }

  private view(r: Run) {
    return { id: r.id, legalEntityId: r.legalEntityId, payGroupId: r.payGroupId, month: this.month(r), subPeriod: r.subPeriod || null, range: r.rangeStart ? { from: dateOf(r.rangeStart), to: dateOf(r.periodEnd) } : null, runType: r.runType, offcycleKind: r.offcycleKind, status: r.status, publishedAt: r.publishedAt, calcVersion: r.calcVersion, totals: r.totals, preparedBy: r.preparedBy, approvedAt: r.approvedAt, voidReason: r.voidReason, createdAt: r.createdAt };
  }

  async list(ctx: TenantContext, user: ScopeUser, month?: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = [...new Set((await Promise.all(VIEW.map((k) => entitiesFor(tx, c, v, k)))).flat())];
      await payScope(tx, ids);
      const rows = await tx.payrollRun.findMany({ where: { organizationId: c.organizationId, legalEntityId: { in: ids }, ...(month ? { periodStart: asDate(`${month}-01`) } : {}) }, orderBy: [{ periodStart: 'desc' }, { createdAt: 'desc' }], take: 200 });
      return rows.map((r) => this.view(r));
    });
  }

  /** One run; while it waits for approval, whether the viewer decides it now and the phrase to type (batch 5j screens). */
  async get(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const run = await this.runIn(tx, c, v, id, VIEW);
      const e = await tx.legalEntity.findFirstOrThrow({ where: { organizationId: c.organizationId, id: run.legalEntityId }, select: { name: true, shortName: true } });
      let approval: { canDecide: boolean; phrase: string; step: number; steps: number } | null = null;
      if (run.status === 'submitted' && run.wfRequestId) {
        const w = await tx.wfRequest.findFirst({ where: { organizationId: c.organizationId, id: run.wfRequestId } });
        const task = w ? await tx.wfTask.findFirst({ where: { organizationId: c.organizationId, requestId: w.id, assigneeUserId: v.userId!, status: 'open', step: w.currentStep } }) : null;
        const steps = w ? (await tx.wfTask.findMany({ where: { organizationId: c.organizationId, requestId: w.id }, distinct: ['step'], select: { step: true } })).length : 0;
        approval = { canDecide: !!task, phrase: approvePhrase(e.shortName, this.month(run)), step: w?.currentStep ?? 0, steps };
      }
      return { ...this.view(run), entityName: e.name, preparedByMe: run.preparedBy === v.userId, approval };
    });
  }

  /** Who the run pays, by name and code (the screens show names; the rows carry ids). */
  async people(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const run = await this.runIn(tx, c, v, id, VIEW);
      return (await this.members(tx, c.organizationId, run)).map((m) => ({ employeeId: m.employeeId, name: m.name, employeeCode: m.employeeCode }));
    });
  }

  // ------------------------------------------------------------------------------------------ who is paid

  private async members(tx: Tx, org: string, run: Run): Promise<Member[]> {
    // An off-cycle run pays the people with items in it, and the leaver of its F&F settlement.
    if (run.runType === 'offcycle')
      return tx.$queryRaw<Member[]>`
        SELECT em.id::text AS "employmentId", e.id::text AS "employeeId", em.joined_on AS "joinedOn", em.exited_on AS "exitedOn", em.employee_code AS "employeeCode",
               concat_ws(' ', coalesce(e.preferred_name, e.given_name), e.family_name) AS name, e.user_id::text AS "userId"
        FROM employments em JOIN employees e ON e.organization_id = em.organization_id AND e.id = em.employee_id
        WHERE em.organization_id = ${org}::uuid AND em.legal_entity_id = ${run.legalEntityId}::uuid
          AND (em.id IN (SELECT o.employment_id FROM one_time_pays o WHERE o.organization_id = ${org}::uuid AND o.run_id = ${run.id}::uuid AND o.status = 'approved' AND o.hold_reason IS NULL)
            OR em.id IN (SELECT f.employment_id FROM fnf_settlements f WHERE f.organization_id = ${org}::uuid AND (f.run_id = ${run.id}::uuid OR f.second_run_id = ${run.id}::uuid)))
        ORDER BY em.id`;
    // A leaver whose F&F settlement pays this month is paid there, not in the regular run.
    return tx.$queryRaw<Member[]>`
      SELECT DISTINCT ON (em.id) em.id::text AS "employmentId", e.id::text AS "employeeId", em.joined_on AS "joinedOn", em.exited_on AS "exitedOn", em.employee_code AS "employeeCode",
             concat_ws(' ', coalesce(e.preferred_name, e.given_name), e.family_name) AS name, e.user_id::text AS "userId"
      FROM pay_group_members m JOIN employments em ON em.organization_id = m.organization_id AND em.id = m.employment_id
      JOIN employees e ON e.organization_id = em.organization_id AND e.id = em.employee_id
      WHERE m.organization_id = ${org}::uuid AND m.pay_group_id = ${run.payGroupId}::uuid
        AND m.valid_from <= ${run.periodEnd} AND (m.valid_to IS NULL OR m.valid_to >= ${run.periodStart})
        AND em.joined_on <= ${run.periodEnd} AND (em.exited_on IS NULL OR em.exited_on >= ${run.periodStart})
        AND NOT EXISTS (SELECT 1 FROM fnf_settlements f WHERE f.organization_id = em.organization_id AND f.employment_id = em.id AND f.status <> 'cancelled' AND f.lwd <= ${run.periodEnd})
      ORDER BY em.id`;
  }

  // ------------------------------------------------------------------------------------------ validations (PAY-3.03)

  /** The pre-run checks of YX-PAY-05, stored for the next calculation (waivers carry over by check and person). */
  private async validate(tx: Tx, c: CompanyContext, run: Run, generation: number) {
    const org = c.organizationId;
    const month = this.month(run);
    const members = await this.members(tx, org, run);
    const ids = members.map((m) => m.employeeId);
    const old = await tx.runValidation.findMany({ where: { organizationId: org, runId: run.id, waivedBy: { not: null } } });
    const found: { employeeId: string | null; checkKey: string; severity: 'block' | 'warn' | 'info'; blocks?: 'calculation' | 'approval'; waivable?: boolean; message: string }[] = [];
    const nameOf = (id: string) => members.find((m) => m.employeeId === id)?.name ?? 'Someone';
    // Bank details (P05 Q7): a block; waiving it holds the person's net pay instead.
    const banks = await tx.employeeBankAccount.findMany({ where: { organizationId: org, employeeId: { in: ids }, purpose: 'salary', validTo: null }, select: { employeeId: true, accountHash: true } });
    // 5g-D2: a death-in-service F&F pays the payees' own accounts, not the deceased's.
    const deaths = run.offcycleKind === 'fnf' ? (await tx.fnfSettlement.findMany({ where: { organizationId: org, exitType: 'death', OR: [{ runId: run.id }, { secondRunId: run.id }] }, select: { employeeId: true } })).map((x) => x.employeeId) : [];
    for (const m of members) if (!deaths.includes(m.employeeId) && !banks.some((b) => b.employeeId === m.employeeId)) found.push({ employeeId: m.employeeId, checkKey: 'bank_missing', severity: 'block', message: `${m.name}: no salary bank account. Waive it to hold their net pay instead.` });
    const byHash = new Map<string, string[]>();
    for (const b of banks) byHash.set(b.accountHash, [...(byHash.get(b.accountHash) ?? []), b.employeeId]);
    for (const [, who] of byHash) if (who.length > 1) for (const id of who) found.push({ employeeId: id, checkKey: 'bank_shared', severity: 'block', message: `${nameOf(id)}: the same bank account as ${who.filter((x) => x !== id).map(nameOf).join(', ')}.` });
    const idents = await tx.employeeIdentifiers.findMany({ where: { organizationId: org, employeeId: { in: ids } }, select: { employeeId: true, panHash: true, uanHash: true } });
    for (const m of members) {
      const i = idents.find((x) => x.employeeId === m.employeeId);
      if (!i?.panHash) found.push({ employeeId: m.employeeId, checkKey: 'pan_missing', severity: 'warn', message: `${m.name}: no PAN on file (tax is deducted at the higher rate when it applies).` });
      if (!i?.uanHash) found.push({ employeeId: m.employeeId, checkKey: 'uan_missing', severity: 'warn', message: `${m.name}: no UAN on file.` });
    }
    // No compensation: that person is left out of this run.
    const comps = await withPayScope(tx, [run.legalEntityId], () => tx.compensation.findMany({ where: { organizationId: org, employmentId: { in: members.map((m) => m.employmentId) }, supersededAt: null, validFrom: { lte: run.periodEnd }, OR: [{ validTo: null }, { validTo: { gte: run.periodStart } }] }, select: { employmentId: true } }));
    for (const m of members) if (!comps.some((x) => x.employmentId === m.employmentId)) found.push({ employeeId: m.employeeId, checkKey: 'no_compensation', severity: 'block', waivable: false, message: `${m.name}: no salary for this month; left out of the run until one is approved.` });
    // 5c-D2: without a skill class on the job, the minimum-wage check uses the lowest class of the state table.
    const noSkill = await tx.employeeAssignment.findMany({ where: { organizationId: org, employeeId: { in: ids }, supersededAt: null, skillClass: null, validFrom: { lte: run.periodEnd }, OR: [{ validTo: null }, { validTo: { gte: run.periodEnd } }] }, select: { employeeId: true } });
    for (const x of noSkill) found.push({ employeeId: x.employeeId, checkKey: 'skill_missing', severity: 'warn', message: `${nameOf(x.employeeId)}: no skill class on the job; the minimum-wage check uses the lowest class.` });
    // US-A-157: pay from another entity of the company this tax year carries into this one's tax (transfer continuity).
    const ty = taxYearOf(month);
    const all = (await tx.legalEntity.findMany({ where: { organizationId: org }, select: { id: true } })).map((e) => e.id);
    const elsewhere = await withPayScope(tx, all, () => tx.payslip.findMany({ where: { organizationId: org, employeeId: { in: ids }, status: 'approved', legalEntityId: { not: run.legalEntityId }, periodStart: { gte: new Date(`${ty.slice(0, 4)}-04-01T00:00:00Z`), lt: run.periodStart } }, distinct: ['employeeId'], select: { employeeId: true } }));
    // 5e-D3: a treaty (DTAA) claim is handled by payroll by hand (no relief is worked out).
    const treaty = await withPayScope(tx, all, () => tx.taxWorkspace.findMany({ where: { organizationId: org, employeeId: { in: ids }, taxYear: ty, dtaaCountry: { not: null } }, select: { employeeId: true, dtaaCountry: true } }));
    for (const x of treaty) found.push({ employeeId: x.employeeId, checkKey: 'tax_dtaa', severity: 'warn', message: `${nameOf(x.employeeId)}: claims treaty (DTAA) relief with ${x.dtaaCountry}; TDS is worked out without it. Check it by hand.` });
    for (const x of elsewhere) found.push({ employeeId: x.employeeId, checkKey: 'tax_continuity', severity: 'info', message: `${nameOf(x.employeeId)}: pay from another entity of the company this tax year is counted for tax.` });
    const lop = await withPayScope(tx, [run.legalEntityId], () => tx.lopInput.findMany({ where: { organizationId: org, periodStart: run.periodStart, employeeId: { in: ids } } }));
    const days = Number(monthRange(month).to.slice(8));
    for (const l of lop) if (D(l.lopDays).gt(days)) found.push({ employeeId: l.employeeId, checkKey: 'lop_too_many', severity: 'block', message: `${nameOf(l.employeeId)}: ${l.lopDays.toString()} loss-of-pay days in a ${days}-day month.` });
    const pendingOneTime = await withPayScope(tx, [run.legalEntityId], () => tx.oneTimePay.count({ where: { organizationId: org, employeeId: { in: ids }, status: 'pending', periodStart: { lte: run.periodStart } } }));
    if (pendingOneTime) found.push({ employeeId: null, checkKey: 'one_time_pending', severity: 'warn', message: `${pendingOneTime} one-time payments are still waiting for approval; they are paid when approved.` });
    const pendingLoans = await withPayScope(tx, [run.legalEntityId], () => tx.loan.count({ where: { organizationId: org, employeeId: { in: ids }, status: 'requested' } }));
    if (pendingLoans) found.push({ employeeId: null, checkKey: 'loans_pending', severity: 'warn', message: `${pendingLoans} loan requests are still waiting for approval.` });
    // Approval blocks: open attendance exceptions (YX-LOCK-08, never waived); a crossed coverage threshold not handled (YX-PAY-53).
    const time = this.moduleRef.get(TimePeriodsService, { strict: false });
    const period = await tx.payPeriod.findFirst({ where: { organizationId: org, legalEntityId: run.legalEntityId, payGroupId: null, periodStart: run.periodStart } });
    if (run.runType === 'regular' && time && (!period || period.stage === 'open' || period.stage === 'frozen')) {
      const pre = await time.preflightIn(tx, c, run.legalEntityId, month);
      if (pre.exceptions) found.push({ employeeId: null, checkKey: 'attendance_exceptions', severity: 'block', blocks: 'approval', waivable: false, message: `${pre.exceptions} days have missing punches or timesheets. Fix them before approval.` });
    }
    const coverage = run.runType === 'regular' ? await tx.establishmentCoverage.findMany({ where: { organizationId: org, legalEntityId: run.legalEntityId, status: 'covered' } }) : [];
    for (const cv of coverage) {
      const reg = await tx.statutoryRegistration.findFirst({ where: { organizationId: org, legalEntityId: run.legalEntityId, statute: cv.statute, status: { in: ['on', 'applied_awaited'] } } });
      if (!reg) found.push({ employeeId: null, checkKey: `coverage_${cv.statute}`, severity: 'block', blocks: 'approval', waivable: false, message: `The entity has ${cv.headcount} people and is covered by ${cv.statute}, but no registration is recorded.` });
    }
    await tx.runValidation.createMany({
      data: found.map((f) => {
        const w = old.find((o) => o.checkKey === f.checkKey && o.employeeId === f.employeeId);
        return { organizationId: org, legalEntityId: run.legalEntityId, runId: run.id, calcVersion: generation, employeeId: f.employeeId, checkKey: f.checkKey, severity: f.severity, blocks: f.blocks ?? 'calculation', waivable: f.waivable ?? true, message: f.message.slice(0, 500), ...(w && (f.waivable ?? true) ? { waivedBy: w.waivedBy, waiverReason: w.waiverReason, waivedAt: w.waivedAt } : {}) };
      }),
    });
  }

  private async current(tx: Tx, org: string, run: Run, generation?: number) {
    const g = generation ?? (await tx.runValidation.aggregate({ where: { organizationId: org, runId: run.id }, _max: { calcVersion: true } }))._max.calcVersion;
    return g === null ? [] : tx.runValidation.findMany({ where: { organizationId: org, runId: run.id, calcVersion: g }, orderBy: [{ severity: 'asc' }, { checkKey: 'asc' }] });
  }

  /** The readiness screen: people, attendance feed state, and the checks as they stand now (refreshed). */
  async readiness(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const run = await this.runIn(tx, c, v, id, ['payroll.run.prepare']);
      if (['draft', 'calculated', 'in_review', 'reopened'].includes(run.status)) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`run:${run.id}`}))`;
        await this.validate(tx, c, run, run.calcVersion + 1);
      }
      const members = await this.members(tx, c.organizationId, run);
      const period = await tx.payPeriod.findFirst({ where: { organizationId: c.organizationId, legalEntityId: run.legalEntityId, payGroupId: null, periodStart: run.periodStart } });
      const checks = await this.current(tx, c.organizationId, run);
      return { run: this.view(run), people: members.length, period: period?.stage ?? 'open', checks: checks.map((x) => ({ id: x.id, employeeId: x.employeeId, checkKey: x.checkKey, severity: x.severity, blocks: x.blocks, waivable: x.waivable, message: x.message, waived: !!x.waivedBy, waiverReason: x.waiverReason })) };
    }, RUN_TX);
  }

  async waive(ctx: TenantContext, user: ScopeUser, id: string, validationId: string, reason: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const run = await this.runIn(tx, c, v, id, ['payroll.run.prepare']);
      const x = await tx.runValidation.findFirst({ where: { organizationId: c.organizationId, runId: run.id, id: validationId } });
      if (!x) throw new NotFoundException('Not found');
      if (!x.waivable || x.severity !== 'block') throw new ConflictException('This check cannot be waived; fix its cause.');
      if (x.waivedBy) return { id: x.id, waived: true };
      await tx.runValidation.update({ where: { id: x.id }, data: { waivedBy: v.userId, waiverReason: reason, waivedAt: new Date() } });
      await audit(tx, c, 'payroll.run.validation_waived', 'payroll_run', run.id, { checkKey: x.checkKey, employeeId: x.employeeId, reason });
      return { id: x.id, waived: true };
    });
  }

  // ------------------------------------------------------------------------------------------ calculate (PAY-3.02, 3.04)

  /** Freezes the month, copies the attendance feed, and queues the people (an advisory lock: one calculation at a time). */
  async calculate(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const run0 = await this.runIn(tx, c, v, id, ['payroll.run.prepare']);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`run:${run0.id}`}))`;
      const run = await tx.payrollRun.findFirstOrThrow({ where: { id: run0.id } });
      if (!['draft', 'calculated', 'in_review', 'reopened'].includes(run.status)) throw new ConflictException(`A ${run.status} run is not calculated again.`);
      const version = run.calcVersion + 1;
      await this.validate(tx, c, run, version);
      const checks = await this.current(tx, org, run, version);
      const blocking = checks.filter((x) => x.severity === 'block' && x.blocks === 'calculation' && x.waivable && !x.waivedBy);
      if (blocking.length) throw new ConflictException({ statusCode: 409, code: 'RUN_BLOCKED', message: `Fix or waive ${blocking.length} blocking checks first.`, checks: blocking.map((x) => x.message) });
      // §9.2 freeze: the entity's month is frozen and the attendance feed copied (the run reads only the copy).
      const month = this.month(run);
      const p = await tx.payPeriod.findFirst({ where: { organizationId: org, legalEntityId: run.legalEntityId, payGroupId: null, periodStart: run.periodStart } });
      if (run.runType === 'regular' && p?.lockedByRunId && run.status !== 'reopened') throw new ConflictException(`${monthText(month)} is already paid and locked.`);
      if (run.runType === 'regular' && (!p || p.stage === 'open')) {
        const period = p
          ? await tx.payPeriod.update({ where: { id: p.id }, data: { stage: 'frozen', changedBy: v.userId, changedAt: new Date(), version: { increment: 1 } } })
          : await tx.payPeriod.create({ data: { organizationId: org, legalEntityId: run.legalEntityId, periodStart: run.periodStart, periodEnd: run.periodEnd, stage: 'frozen', changedBy: v.userId } });
        await tx.periodLockEvent.create({ data: { organizationId: org, payPeriodId: period.id, fromStage: 'open', toStage: 'frozen', byUser: v.userId, reason: 'Payroll calculation started' } });
        const time = this.moduleRef.get(TimePeriodsService, { strict: false });
        const rows = time ? await time.feedRows(tx, c, run.legalEntityId, month) : [];
        await tx.payrollFeedRow.updateMany({ where: { organizationId: org, payPeriodId: period.id, supersededAt: null }, data: { supersededAt: new Date() } });
        if (rows.length) await tx.payrollFeedRow.createMany({ data: rows.map((r) => ({ organizationId: org, payPeriodId: period.id, legalEntityId: run.legalEntityId, periodStart: run.periodStart, employeeId: r.employeeId, mode: r.mode, calendarDays: r.calendarDays, paidDays: r.paidDays, lopDays: r.lopDays, otNormalMinutes: r.otNormalMinutes, otWeeklyOffMinutes: r.otWeeklyOffMinutes, otHolidayMinutes: r.otHolidayMinutes, nightShifts: r.nightShifts, compOffDays: r.compOffDays, timesheetMinutes: r.timesheetMinutes })) });
      }
      const skip = new Set(checks.filter((x) => x.checkKey === 'no_compensation').map((x) => x.employeeId));
      const members = await this.members(tx, org, run);
      await payScope(tx, [run.legalEntityId]);
      // Recalculating replaces the drafts of the earlier calculation (kept, marked void).
      await tx.payslip.updateMany({ where: { organizationId: org, runId: run.id, status: 'draft' }, data: { status: 'void', voidReason: 'Recalculated' } });
      await tx.runEmployee.createMany({ data: members.map((m) => ({ organizationId: org, legalEntityId: run.legalEntityId, runId: run.id, employmentId: m.employmentId, employeeId: m.employeeId, calcVersion: version, state: skip.has(m.employeeId) ? 'skipped' : 'queued', includedReason: skip.has(m.employeeId) ? 'No salary for this month' : null })) });
      await tx.payrollRun.update({ where: { id: run.id }, data: { status: 'calculating', calcVersion: version, version: { increment: 1 } } });
      await audit(tx, c, 'payroll.run.calculating', 'payroll_run', run.id, { calcVersion: version, people: members.length - skip.size });
      return { org, runId: run.id, version, ids: members.filter((m) => !skip.has(m.employeeId)).map((m) => m.employmentId) };
    }, RUN_TX);
    for (let i = 0; i < out.ids.length; i += CHUNK) await this.queue.add('calc', { org: out.org, runId: out.runId, version: out.version, ids: out.ids.slice(i, i + CHUNK) }, { jobId: `${out.runId}:${out.version}:${i / CHUNK}`, removeOnComplete: 1000, removeOnFail: 1000 });
    if (!out.ids.length) await this.finish(out.org, out.runId, out.version);
    return { runId: out.runId, calcVersion: out.version, queued: out.ids.length };
  }

  /** One job: each person in its own transaction; a failure is recorded with what to fix and the others go on. */
  async calculateChunk(job: { org: string; runId: string; version: number; ids: string[] }) {
    const c = { organizationId: job.org, isSuperAdmin: false, userId: null } as unknown as CompanyContext;
    const rules = await this.rules.published();
    const reads = new ChunkReads(job.ids);
    for (const employmentId of job.ids) {
      try {
        await this.tenantPrisma.forTenant(c, async (tx) => {
          const entity = await reads.once('entity', () => this.entityOfRun(tx, job.org, job.runId));
          await payScope(tx, [entity]);
          const re = await tx.runEmployee.findFirst({ where: { organizationId: job.org, runId: job.runId, calcVersion: job.version, employmentId } });
          if (!re || re.state !== 'queued') return;
          const r = await tx.payrollRun.findFirstOrThrow({ where: { organizationId: job.org, id: job.runId } });
          if (r.calcVersion !== job.version || r.status !== 'calculating') return;
          const snap = await this.snapshot(tx, c, r, employmentId, rules, reads);
          const result = calculatePayslip(snap, rules);
          const slip = await tx.payslip.create({
            data: { organizationId: job.org, legalEntityId: r.legalEntityId, runId: r.id, runType: r.runType, employmentId, employeeId: re.employeeId, periodStart: r.periodStart, subPeriod: r.subPeriod, calcVersion: job.version, version: await this.nextVersion(tx, job.org, employmentId, r), gross: result.gross, deductions: result.deductions, net: result.net, employerCost: result.employerCost, ruleVersions: result.ruleVersions, snapshotHash: hashOf(snap), resultHash: result.resultHash, verify: result.verify, held: snap.held },
          });
          await tx.payslipLine.createMany({ data: result.lines.map((l, i) => ({ organizationId: job.org, legalEntityId: r.legalEntityId, employeeId: re.employeeId, payslipId: slip.id, position: i, componentCode: l.code, name: l.name.slice(0, 80), kind: l.kind, segmentNo: l.segmentNo, amount: l.amount, quantity: l.quantity ?? null, rate: l.rate ?? null, explanation: l.explanation.slice(0, 1000), rule: l.rule ? (l.rule as unknown as Prisma.InputJsonValue) : Prisma.DbNull, verify: !!l.verify, sourceRef: l.sourceRef ?? null })) });
          await tx.payslipSnapshot.create({ data: { payslipId: slip.id, organizationId: job.org, legalEntityId: r.legalEntityId, employeeId: re.employeeId, inputs: snap as unknown as Prisma.InputJsonValue, ruleVersions: result.ruleVersions, engineVersion: ENGINE_VERSION, inputsHash: hashOf(snap) } });
          if (result.tax) await tx.tdsProjection.create({ data: { payslipId: slip.id, organizationId: job.org, legalEntityId: r.legalEntityId, employeeId: re.employeeId, employmentId, taxYear: result.tax.taxYear, lawVersion: result.tax.lawVersion, regime: result.tax.regime, calcVersion: result.tax.calcVersion, monthTds: result.tax.monthTds, annualTax: result.tax.tax.total, inputs: snap.tax as unknown as Prisma.InputJsonValue, result: result.tax as unknown as Prisma.InputJsonValue } });
          await tx.runEmployee.update({ where: { id: re.id }, data: { state: 'ok', failure: Prisma.DbNull, updatedAt: new Date() } });
        }, PERSON_TX);
      } catch (e) {
        const field = e instanceof NotReady ? e.field : null;
        const message = e instanceof NotReady || e instanceof StatutoryError ? e.message : 'The calculation failed for this person.';
        if (!(e instanceof NotReady || e instanceof StatutoryError)) this.logger.error(`payroll calc ${job.runId} ${employmentId}: ${(e as Error).message}`);
        await this.tenantPrisma.forTenant(c, async (tx) => {
          await payScope(tx, [await this.entityOfRun(tx, job.org, job.runId)]);
          await tx.runEmployee.updateMany({ where: { organizationId: job.org, runId: job.runId, calcVersion: job.version, employmentId, state: 'queued' }, data: { state: 'failed', failure: { field, message }, updatedAt: new Date() } });
        });
      }
    }
    await this.finish(job.org, job.runId, job.version);
  }

  private async nextVersion(tx: Tx, org: string, employmentId: string, run: Run) {
    if (run.runType !== 'regular') return 1;
    const prev = await tx.payslip.aggregate({ where: { organizationId: org, employmentId, periodStart: run.periodStart, subPeriod: run.subPeriod, runType: 'regular', status: { in: ['approved', 'revised'] } }, _max: { version: true } });
    return (prev._max.version ?? 0) + 1;
  }

  /** When nobody is queued any more: calculated (totals, variances, post-calculation checks) or back to draft with failures. */
  private async finish(org: string, runId: string, version: number) {
    const c = { organizationId: org, isSuperAdmin: false, userId: null } as unknown as CompanyContext;
    await this.tenantPrisma.forTenant(c, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`run:${runId}`}))`;
      const entity = await this.entityOfRun(tx, org, runId);
      await payScope(tx, [entity]);
      const run = await tx.payrollRun.findFirst({ where: { organizationId: org, id: runId } });
      if (!run || run.status !== 'calculating' || run.calcVersion !== version) return;
      const states = await tx.runEmployee.groupBy({ by: ['state'], where: { organizationId: org, runId, calcVersion: version }, _count: { _all: true } });
      const n = (s: string) => states.find((x) => x.state === s)?._count._all ?? 0;
      if (n('queued')) return;
      const slips = await tx.payslip.findMany({ where: { organizationId: org, runId, calcVersion: version, status: 'draft' } });
      const sum = (k: 'gross' | 'deductions' | 'net' | 'employerCost') => slips.reduce((t, s) => t.add(s[k]), D(0)).toFixed(2);
      const totals = { people: slips.length, gross: sum('gross'), deductions: sum('deductions'), net: sum('net'), employerCost: sum('employerCost'), failed: n('failed'), skipped: n('skipped') };
      if (n('failed')) {
        await tx.payrollRun.update({ where: { id: runId }, data: { status: 'draft', totals, version: { increment: 1 } } });
        await audit(tx, c, 'payroll.run.calculation_failed', 'payroll_run', runId, { calcVersion: version, failed: n('failed') });
        return;
      }
      if (run.runType === 'regular') await this.variances(tx, org, run, slips);
      // Post-calculation checks: pay below the minimum wage (warn), the Code wage add-back (info).
      const lines = await tx.payslipLine.findMany({ where: { organizationId: org, payslipId: { in: slips.map((s) => s.id) }, componentCode: 'code_wage_add_back' }, select: { employeeId: true } });
      for (const l of lines) await tx.runValidation.create({ data: { organizationId: org, legalEntityId: run.legalEntityId, runId, calcVersion: version, employeeId: l.employeeId, checkKey: 'code_wage_add_back', severity: 'info', message: 'Allowances pass half of pay: part is added back to the wage for PF, ESI, gratuity and bonus.' } });
      await tx.payrollRun.update({ where: { id: runId }, data: { status: 'calculated', totals, version: { increment: 1 } } });
      await audit(tx, c, 'payroll.run.calculated', 'payroll_run', runId, { calcVersion: version, ...totals });
    }, RUN_TX);
  }

  // ------------------------------------------------------------------------------------------ the snapshot (§3.5)

  /** Everything one person's month is worked out from, by value (the function reads nothing else). */
  async snapshot(tx: Tx, c: CompanyContext, run: Run, employmentId: string, rules: RuleSet[], reads = new ChunkReads([employmentId])): Promise<Snapshot> {
    const org = c.organizationId;
    const month = this.month(run);
    const { from, to } = monthRange(month);
    const days = Number(to.slice(8));
    // PAY-9.01: a weekly or fortnightly run pays its own days; the month's items wait for the run that ends the month.
    const sub = run.rangeStart ? { k: run.subPeriod, from: dateOf(run.rangeStart), to: dateOf(run.periodEnd), final: dateOf(run.periodEnd) === to } : null;
    const monthly = !sub || sub.final;
    const ids = reads.employmentIds;
    const mine = <T extends { employmentId: string }>(rows: T[]) => rows.filter((x) => x.employmentId === employmentId);
    const overlaps = { validFrom: { lte: asDate(to) }, OR: [{ validTo: null }, { validTo: { gte: asDate(from) } }] };
    const ems = await reads.once('employments', () => tx.employment.findMany({ where: { organizationId: org, id: { in: ids } } }));
    const em = ems.find((x) => x.id === employmentId);
    if (!em) throw new NotReady('employment', 'No employment.');
    const fnf = run.offcycleKind === 'fnf' ? await tx.fnfSettlement.findFirst({ where: { organizationId: org, employmentId, OR: [{ runId: run.id }, { secondRunId: run.id }] } }) : null;
    // The F&F run pays salary to the approved last day (the employment may end only on that day); a second F&F run pays items only.
    let offcycle: Snapshot['offcycle'] = run.runType === 'regular' ? undefined : fnf && fnf.runId === run.id ? 'fnf' : run.offcycleKind === 'fnf' ? 'payment' : (run.offcycleKind as Snapshot['offcycle']);
    // Never the month's salary twice: if a regular payslip already paid the last month, the F&F pays its lines only.
    if (offcycle === 'fnf' && (await tx.payslip.count({ where: { organizationId: org, employmentId, periodStart: run.periodStart, runType: 'regular', status: 'approved' } }))) offcycle = 'payment';
    const itemsOnly = !!offcycle && offcycle !== 'fnf';
    const exitOn = em.exitedOn ? dateOf(em.exitedOn) : fnf ? dateOf(fnf.lwd) : null;
    const start = dateOf(em.joinedOn) > (sub?.from ?? from) ? dateOf(em.joinedOn) : (sub?.from ?? from);
    const end = exitOn && exitOn < (sub?.to ?? to) ? exitOn : (sub?.to ?? to);
    if (start > end) throw new NotReady('employment', 'Not employed in this pay period.');
    const group = await reads.once('group', () => tx.payGroup.findFirstOrThrow({ where: { organizationId: org, id: run.payGroupId } }));
    const inRange = <T extends { validFrom: Date; validTo: Date | null }>(rows: T[]) => rows.filter((x) => dateOf(x.validFrom) <= end && (!x.validTo || dateOf(x.validTo) >= start));
    const allComps = await reads.once('compensations', () => tx.compensation.findMany({ where: { organizationId: org, employmentId: { in: ids }, supersededAt: null, ...overlaps }, orderBy: { validFrom: 'asc' } }));
    const comps = inRange(mine(allComps));
    const assigns = inRange(mine(await reads.once('assignments', () => tx.employeeAssignment.findMany({ where: { organizationId: org, employmentId: { in: ids }, supersededAt: null, ...overlaps }, orderBy: { validFrom: 'asc' } }))));
    const allComponents = await reads.once('components', () => tx.payComponent.findMany({ where: { organizationId: org } }));
    const packages = await reads.once('packages', () => tx.compensationPackage.findMany({ where: { organizationId: org, changeId: { in: allComps.map((x) => x.changeId) } } }));
    const packageLines = await reads.once('packageLines', () => tx.compensationLine.findMany({ where: { organizationId: org, packageId: { in: packages.map((x) => x.id) } } }));
    const locations = await reads.once('locations', () => tx.location.findMany({ where: { organizationId: org }, select: { id: true, state: true, minWageZone: true } }));
    if (!comps.length) throw new NotReady('compensation', 'No salary for this month.');
    if (!assigns.length) throw new NotReady('assignment', 'No job details for this month.');
    const cuts = [...new Set([start, ...comps.map((x) => dateOf(x.validFrom)), ...assigns.map((x) => dateOf(x.validFrom))].filter((d) => d >= start && d <= end))].sort();
    const covering = <T extends { validFrom: Date; validTo: Date | null }>(rows: T[], d: string) => rows.find((x) => dateOf(x.validFrom) <= d && (!x.validTo || dateOf(x.validTo) >= d));
    const segments: Segment[] = [];
    for (let i = 0; i < cuts.length; i++) {
      const sFrom = cuts[i];
      const sTo = i + 1 < cuts.length ? addDays(cuts[i + 1], -1) : end;
      const comp = covering(comps, sFrom);
      const asg = covering(assigns, sFrom);
      if (!comp || !asg) throw new NotReady('compensation', `No salary or job details on ${sFrom}.`);
      const pkg = packages.find((x) => x.changeId === comp.changeId);
      if (!pkg) throw new NotReady('compensation', `The salary from ${dateOf(comp.validFrom)} has no breakup. Revise it in Payroll › Compensation.`);
      const pl = packageLines.filter((l) => l.packageId === pkg.id);
      const codes = new Map(allComponents.map((x) => [x.id, x.code]));
      const loc = locations.find((x) => x.id === asg.locationId);
      if (!loc) throw new NotReady('assignment', 'The job has no work location.');
      segments.push({ from: sFrom, to: sTo, days: Number(sTo.slice(8)) - Number(sFrom.slice(8)) + 1, lines: pl.map((l) => ({ code: codes.get(l.componentId)!, monthly: l.monthly.toFixed(2) })), payBasis: pkg.payBasis as Segment['payBasis'], rate: pkg.rate?.toFixed(2) ?? null, otMultiplier: pkg.otMultiplier?.toFixed(2) ?? null, holidayMultiplier: pkg.holidayMultiplier?.toFixed(2) ?? null, state: loc.state, zone: loc.minWageZone, skill: asg.skillClass ?? null, changeId: comp.changeId });
    }
    const components: CalcComponent[] = allComponents.map((x) => ({ code: x.code, name: x.name, kind: x.kind as CalcComponent['kind'], pfWage: x.pfWage, esiWage: x.esiWage, ptWage: x.ptWage, gratuityWage: x.gratuityWage, bonusWage: x.bonusWage, codeWagePart: x.codeWagePart, codeExclusion: x.codeExclusion, prorated: x.prorated, rounding: x.rounding as CalcComponent['rounding'], statutory: x.statutory, taxable: x.taxable }));
    // Attendance: the frozen feed, or the manual LOP of an assumed-present group (D1).
    const period = await reads.once('period', () => tx.payPeriod.findFirst({ where: { organizationId: org, legalEntityId: run.legalEntityId, payGroupId: null, periodStart: run.periodStart } }));
    const feeds = period ? await reads.once('feed', () => tx.payrollFeedRow.findMany({ where: { organizationId: org, payPeriodId: period.id, employeeId: { in: ems.map((x) => x.employeeId) }, supersededAt: null }, orderBy: { frozenAt: 'desc' } })) : [];
    let feed: { lopDays: Prisma.Decimal; otNormalMinutes: number; otWeeklyOffMinutes: number; otHolidayMinutes: number; timesheetMinutes: number } | null = feeds.find((x) => x.employeeId === em.employeeId) ?? null;
    // An F&F run before the month is frozen reads the leaver's attendance straight from the time module (nothing is frozen).
    if (!feed && offcycle === 'fnf') {
      const time = this.moduleRef.get(TimePeriodsService, { strict: false });
      const row = time ? (await time.feedRows(tx, c, run.legalEntityId, month)).find((r) => r.employeeId === em.employeeId) : undefined;
      if (row) feed = { lopDays: D(row.lopDays), otNormalMinutes: row.otNormalMinutes, otWeeklyOffMinutes: row.otWeeklyOffMinutes, otHolidayMinutes: row.otHolidayMinutes, timesheetMinutes: row.timesheetMinutes };
    }
    // DECISION NEEDED: M02 freezes attendance by month, so a sub-period run reads only the LOP entered for its own period.
    if (itemsOnly || sub) feed = null;
    const manual = itemsOnly ? null : (mine(await reads.once('lop', () => tx.lopInput.findMany({ where: { organizationId: org, employmentId: { in: ids }, periodStart: run.rangeStart ?? run.periodStart } })))[0] ?? null);
    const attendance: Snapshot['attendance'] = manual
      ? { lopDays: manual.lopDays.toFixed(2), source: 'manual', otMinutes: { normal: feed?.otNormalMinutes ?? 0, weeklyOff: feed?.otWeeklyOffMinutes ?? 0, holiday: feed?.otHolidayMinutes ?? 0 }, timesheetMinutes: feed?.timesheetMinutes ?? 0 }
      : feed
        ? { lopDays: feed.lopDays.toFixed(2), source: 'feed', otMinutes: { normal: feed.otNormalMinutes, weeklyOff: feed.otWeeklyOffMinutes, holiday: feed.otHolidayMinutes }, timesheetMinutes: feed.timesheetMinutes }
        : { lopDays: '0', source: 'none', otMinutes: { normal: 0, weeklyOff: 0, holiday: 0 }, timesheetMinutes: 0 };
    // The statutory profile in force at the month's end, else the employment-type defaults (IN.EMPTYPE).
    const prof = mine(await reads.once('profiles', () => tx.employeeStatutory.findMany({ where: { organizationId: org, employmentId: { in: ids }, ...overlaps } }))).find((x) => dateOf(x.validFrom) <= end && (!x.validTo || dateOf(x.validTo) >= end)) ?? null;
    const lastAsg = assigns[assigns.length - 1];
    const lastState = segments[segments.length - 1].state;
    const type = (await reads.once('types', () => tx.employmentType.findMany({ where: { organizationId: org }, select: { id: true, category: true } }))).find((x) => x.id === lastAsg.employmentTypeId);
    if (!type) throw new NotReady('assignment', 'The job has no employment type.');
    const empRs = inForce(rules, 'IN.EMPTYPE', ['IN'], end);
    const dflt = (s: string) => (empRs ? empDefaults(empRs, { category: type.category, statute: s }).applicability : 'mandatory');
    const personal = (await reads.once('personal', () => tx.employeePersonalDetails.findMany({ where: { organizationId: org, employeeId: { in: ems.map((x) => x.employeeId) } }, select: { employeeId: true, dateOfBirth: true, gender: true } }))).find((x) => x.employeeId === em.employeeId) ?? null;
    const age = personal?.dateOfBirth ? Number(end.slice(0, 4)) - Number(dateOf(personal.dateOfBirth).slice(0, 4)) - (end.slice(5) < dateOf(personal.dateOfBirth).slice(5) ? 1 : 0) : 30;
    const option = (key: string) => reads.once(`option:${key}:${end}`, async () => (await tx.entityStatutoryOption.findFirst({ where: { organizationId: org, legalEntityId: run.legalEntityId, optionKey: key, validFrom: { lte: asDate(end) }, OR: [{ validTo: null }, { validTo: { gte: asDate(end) } }] } }))?.value ?? null);
    const esiMode = (prof?.esi ?? (dflt('IN.ESI') === 'excluded' ? 'no' : 'by_wage')) as 'yes' | 'no' | 'by_wage';
    // ESI coverage is decided at the start of each contribution period (Apr–Sep, Oct–Mar) and kept until it ends.
    const cpStart = `${month.slice(5) >= '10' || month.slice(5) <= '03' ? (month.slice(5) <= '03' ? Number(month.slice(0, 4)) - 1 : month.slice(0, 4)) : month.slice(0, 4)}-${month.slice(5) >= '04' && month.slice(5) <= '09' ? '04' : '10'}-01`;
    const earlier = await tx.payslip.findFirst({ where: { organizationId: org, employmentId, runType: 'regular', status: 'approved', periodStart: { gte: asDate(cpStart), lt: run.periodStart } }, orderBy: { periodStart: 'asc' } });
    let covered = esiMode === 'yes';
    if (esiMode === 'by_wage') {
      if (earlier) covered = (await tx.payslipLine.count({ where: { organizationId: org, payslipId: earlier.id, componentCode: { in: components.filter((x) => x.statutory === 'esi_employee').map((x) => x.code) } } })) > 0;
      else {
        const esiRs = inForce(rules, 'IN.ESI', ['IN'], end);
        const wage = segments[0].lines.filter((l) => components.find((x) => x.code === l.code)?.esiWage).reduce((t, l) => t.add(l.monthly), D(0));
        covered = !!esiRs && esiCovered(esiRs, wage, !!prof?.pwdCeilingConsent);
      }
    }
    const fyStart = `${Number(month.slice(5)) >= 4 ? month.slice(0, 4) : Number(month.slice(0, 4)) - 1}-04-01`;
    const ptCodes = components.filter((x) => x.statutory === 'pt').map((x) => x.code);
    const ytdPt = await tx.payslipLine.aggregate({ where: { organizationId: org, componentCode: { in: ptCodes }, payslipId: { in: (await tx.payslip.findMany({ where: { organizationId: org, employmentId, status: 'approved', periodStart: { gte: asDate(fyStart), lt: run.periodStart } }, select: { id: true } })).map((x) => x.id) } }, _sum: { amount: true } });
    // The regular run pays the items of no off-cycle run; an off-cycle run pays only its own (never held-back F&F items).
    const oneTime = !monthly ? [] : mine(
      await reads.once('oneTime', () =>
        tx.oneTimePay.findMany({
          where: run.runType === 'regular' ? { organizationId: org, employmentId: { in: ids }, status: 'approved', runId: null, holdReason: null, OR: [{ periodStart: run.periodStart, endOn: null }, { periodStart: { lte: run.periodStart }, endOn: { gte: run.periodStart } }] } : { organizationId: org, employmentId: { in: ids }, status: 'approved', runId: run.id, holdReason: null },
          orderBy: { createdAt: 'asc' },
        }),
      ),
    );
    const special = itemsOnly || !monthly ? [] : mine(await reads.once('special', () => tx.specialDays.findMany({ where: { organizationId: org, employmentId: { in: ids }, periodStart: run.periodStart } })));
    const recent = await tx.payslip.findMany({ where: { organizationId: org, employmentId, status: 'approved', runType: 'regular', periodStart: { lt: run.periodStart } }, orderBy: { periodStart: 'desc' }, take: 3 });
    const recentDays = recent.reduce((t, x) => t + Number(monthRange(dateOf(x.periodStart).slice(0, 7)).to.slice(8)), 0);
    const courts = itemsOnly || !monthly ? [] : mine(await reads.once('courts', () => tx.courtOrder.findMany({ where: { organizationId: org, employmentId: { in: ids }, status: 'active', priorityDate: { lte: asDate(to) }, OR: [{ endOn: null }, { endOn: { gte: asDate(from) } }] } }))).filter((o) => dateOf(o.priorityDate) <= end && (!o.endOn || dateOf(o.endOn) >= start));
    const loans = itemsOnly || !monthly ? [] : mine(await reads.once('loans', () => tx.loan.findMany({ where: { organizationId: org, employmentId: { in: ids }, status: 'active', firstMonth: { lte: run.periodStart }, outstanding: { gt: 0 }, OR: [{ pausedUntil: null }, { pausedUntil: { lt: run.periodStart } }] }, orderBy: { firstMonth: 'asc' } })));
    const carries = itemsOnly || !monthly ? [] : mine(await reads.once('carries', () => tx.payCarryForward.findMany({ where: { organizationId: org, employmentId: { in: ids }, status: 'open' }, orderBy: { createdAt: 'asc' } })));
    const overpaid = itemsOnly || !monthly ? [] : mine(await reads.once('overpaid', () => tx.overpaymentRecovery.findMany({ where: { organizationId: org, employmentId: { in: ids }, status: 'active' }, orderBy: { createdAt: 'asc' } })));
    const hold = mine(await reads.once('holds', () => tx.payrollWithhold.findMany({ where: { organizationId: org, employmentId: { in: ids }, releasedAt: null } })))[0] ?? null;
    const waived = await reads.once('waivedBank', async () => new Set((await this.current(tx, org, run, run.calcVersion)).filter((x) => x.checkKey === 'bank_missing' && x.waivedBy).map((x) => x.employeeId)));
    const waivedBank = waived.has(em.employeeId);
    const lev = { legalEntityId: run.legalEntityId };
    // The run that ends the month takes PT and TDS on the month so far: the earlier periods' approved payslips.
    const mtd = sub?.final ? await this.monthToDate(tx, org, employmentId, run, allComponents) : null;
    return {
      employeeId: em.employeeId,
      employmentId,
      legalEntityId: run.legalEntityId,
      period: { start: from, end: to, days },
      dayBasis: group.dayBasis as Snapshot['dayBasis'],
      segments,
      components,
      attendance,
      profile: {
        pf: prof ? prof.pf === 'yes' : dflt('IN.PF') === 'mandatory',
        eps: prof?.eps ?? true,
        vpfPercent: prof?.vpfPercent.toFixed(2) ?? '0',
        pfOnActualWage: prof?.pfOnActualWage ?? (await option('pf.on_actual_wage')) === 'yes',
        esi: esiMode,
        esiCoveredThisPeriod: covered,
        pwd: prof?.pwdCeilingConsent ?? false,
        ptState: prof?.ptState ?? lastState,
        lwfState: prof?.lwfState ?? lastState,
        gender: personal?.gender ?? null,
        age,
      },
      ytd: { pt: (ytdPt._sum.amount ?? D(0)).toFixed(2) },
      oneTime: oneTime.map((o) => ({ id: o.id, code: o.componentCode, amount: o.amount.toFixed(2), days: o.endOn && dateOf(o.endOn) <= to && dateOf(o.periodStart) < from ? Number(dateOf(o.endOn).slice(8)) : null, ...(o.label ? { label: o.label } : {}) })),
      special: special.map((x) => ({ kind: x.kind as 'suspension' | 'maternity' | 'injury', days: x.days.toFixed(2), daysBefore: x.daysBefore })),
      averageDailyWage: recentDays ? recent.reduce((t, x) => t.add(x.gross), D(0)).div(recentDays).toFixed(2) : null,
      recoveries: {
        courtOrders: courts.map((o) => ({ id: o.id, ref: o.orderRef, amount: o.amount?.toFixed(2) ?? null, percent: o.percent?.toFixed(2) ?? null, priorityDate: dateOf(o.priorityDate), remaining: o.capTotal ? o.capTotal.sub(o.remittedTotal).toFixed(2) : null })),
        // The leaver's last pay recovers the whole loan balance and whatever is left of an agreed overpayment.
        loans: loans.map((l) => ({ id: l.id, emi: (offcycle === 'fnf' ? l.outstanding : l.emi).toFixed(2), outstanding: l.outstanding.toFixed(2) })),
        carryForwards: carries.map((x) => ({ id: x.id, balance: x.amount.sub(x.recovered).toFixed(2) })),
        ...(overpaid.length ? { overpayments: overpaid.map((x) => { const left = x.amount.sub(x.recovered).sub(x.writtenOff); return { id: x.id, instalment: (offcycle === 'fnf' ? left : x.instalment).toFixed(2), balance: left.toFixed(2) }; }) } : {}),
      },
      options: {
        bonusRate: await option('bonus.rate'),
        bonusPayment: ((await option('bonus.payment')) ?? 'annual') as 'annual' | 'monthly',
        protectedNetPercent: await reads.once('setting:net', () => settingFor(tx, c, 'payroll.protected_net_percent', lev)),
        netRounding: (await reads.once('setting:rounding', () => settingFor(tx, c, 'payroll.net_rounding', lev))) as 'none' | 'rupee',
        standardDailyHours: await reads.once('setting:hours', () => settingFor(tx, c, 'payroll.standard_daily_hours', lev)),
      },
      held: !!hold || waivedBank,
      // Batch 5e: income tax, from the same function as the employee's tax sheet.
      ...(offcycle ? { offcycle } : {}),
      ...(sub ? { sub: { k: sub.k, final: sub.final, ...(mtd ? { mtd } : {}) } } : {}),
      tax: !monthly ? undefined : await buildTaxInputs(tx, c, { employeeId: em.employeeId, employmentId, legalEntityId: run.legalEntityId, month, periodStart: run.periodStart, exitedOn: exitOn ? asDate(exitOn) : null, segment: segments[segments.length - 1], components, age }),
    };
  }

  /** Earlier sub-periods of the month (approved): taxable pay, PT wage, basic, HRA and PT, for the run that ends the month. */
  private async monthToDate(tx: Tx, org: string, employmentId: string, run: Run, comps: { code: string; taxable: boolean; ptWage: boolean; statutory: string | null; kind: string }[]) {
    const slips = await tx.payslip.findMany({ where: { organizationId: org, employmentId, periodStart: run.periodStart, runType: 'regular', status: 'approved', subPeriod: { gt: 0, not: run.subPeriod } }, select: { id: true } });
    const lines = await tx.payslipLine.findMany({ where: { organizationId: org, payslipId: { in: slips.map((x) => x.id) } }, select: { componentCode: true, kind: true, amount: true } });
    const by = (pick: (l: { componentCode: string; kind: string }) => boolean) => lines.filter(pick).reduce((t, l) => t.add(l.amount), D(0)).toFixed(2);
    const c = (code: string) => comps.find((x) => x.code === code);
    return {
      taxable: by((l) => l.kind === 'earning' && c(l.componentCode)?.taxable !== false),
      ptWage: by((l) => l.kind === 'earning' && !!c(l.componentCode)?.ptWage),
      basic: by((l) => l.componentCode === 'basic'),
      hra: by((l) => l.componentCode === 'hra'),
    };
  }

  // ------------------------------------------------------------------------------------------ progress and review

  async progress(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const run = await this.runIn(tx, c, v, id, VIEW);
      const rows = await tx.runEmployee.findMany({ where: { organizationId: c.organizationId, runId: run.id, calcVersion: run.calcVersion } });
      const count = (s: string) => rows.filter((r) => r.state === s).length;
      return { status: run.status, calcVersion: run.calcVersion, total: rows.length, ok: count('ok'), failed: count('failed'), skipped: count('skipped'), queued: count('queued'), failures: rows.filter((r) => r.state === 'failed').map((r) => ({ employeeId: r.employeeId, ...(r.failure as object) })) };
    });
  }

  private slipView(s: Prisma.PayslipGetPayload<object>) {
    return { id: s.id, runId: s.runId, employeeId: s.employeeId, month: dateOf(s.periodStart).slice(0, 7), version: s.version, calcVersion: s.calcVersion, status: s.status, gross: s.gross.toFixed(2), deductions: s.deductions.toFixed(2), net: s.net.toFixed(2), employerCost: s.employerCost.toFixed(2), verify: s.verify, held: s.held, paymentStatus: s.paymentStatus };
  }

  async payslips(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const run = await this.runIn(tx, c, v, id, VIEW);
      const slips = await tx.payslip.findMany({ where: { organizationId: c.organizationId, runId: run.id, calcVersion: run.calcVersion, status: { in: ['draft', 'approved'] } }, orderBy: { createdAt: 'asc' } });
      return slips.map((s) => this.slipView(s));
    });
  }

  /** One payslip with every line and its explanation ("why this number", YX-PAY-12). */
  async payslip(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = [...new Set((await Promise.all(VIEW.map((k) => entitiesFor(tx, c, v, k)))).flat())];
      await payScope(tx, ids);
      const s = await tx.payslip.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!s) throw new NotFoundException('Not found');
      const staff = ids.includes(s.legalEntityId);
      // An employee sees their own payslip once it is published (5d); the runs table is payroll staff's, so a definer
      // function says only whether the run is published. Payroll staff see their entities'.
      const published = async () => !!s.runId && (await tx.$queryRaw<{ ids: string[] }[]>`SELECT payroll_runs_published(${c.organizationId}::uuid, ARRAY[${s.runId}::uuid])::text[] AS ids`)[0].ids.length > 0;
      if (!staff && !(s.status === 'approved' && (await published()))) throw new NotFoundException('Not found');
      const lines = await tx.payslipLine.findMany({ where: { organizationId: c.organizationId, payslipId: s.id }, orderBy: { position: 'asc' } });
      if (staff) await audit(tx, c, 'payroll.payslip.viewed', 'payslip', s.id, { employeeId: s.employeeId });
      return { ...this.slipView(s), ruleVersions: s.ruleVersions, lines: lines.map((l) => ({ code: l.componentCode, name: l.name, kind: l.kind, segmentNo: l.segmentNo, amount: l.amount.toFixed(2), quantity: l.quantity?.toFixed(2) ?? null, rate: l.rate?.toFixed(4) ?? null, explanation: l.explanation, rule: l.rule, verify: l.verify })) };
    });
  }

  /** YX-PAY-06: net change above the threshold, or a component added or removed, against the last approved payslip. */
  private async variances(tx: Tx, org: string, run: Run, slips: Prisma.PayslipGetPayload<object>[]) {
    const c = { organizationId: org } as CompanyContext;
    const pct = D(await settingFor(tx, c, 'payroll.variance_threshold_pct', { legalEntityId: run.legalEntityId }));
    if (!slips.length) return;
    // 5j-D1: everyone's last approved regular payslip and both payslips' components, read once for the run.
    const prevs = await tx.$queryRaw<{ id: string; employmentId: string; net: Prisma.Decimal }[]>`
      SELECT DISTINCT ON (employment_id) id::text, employment_id::text AS "employmentId", net FROM payslips
      WHERE organization_id = ${org}::uuid AND employment_id = ANY(${slips.map((x) => x.employmentId)}::uuid[]) AND status = 'approved' AND run_type = 'regular' AND period_start < ${run.periodStart}
      ORDER BY employment_id, period_start DESC`;
    const lines = await tx.payslipLine.findMany({ where: { organizationId: org, payslipId: { in: [...slips.map((x) => x.id), ...prevs.map((x) => x.id)] }, kind: { in: ['earning', 'deduction'] } }, select: { payslipId: true, componentCode: true } });
    const codes = (id: string) => new Set(lines.filter((l) => l.payslipId === id).map((l) => l.componentCode));
    const rows: Prisma.VarianceFlagCreateManyInput[] = [];
    for (const s of slips) {
      const prev = prevs.find((x) => x.employmentId === s.employmentId);
      if (!prev) continue;
      const add = (kind: string, size: Prisma.Decimal | null, detail: string) => rows.push({ organizationId: org, legalEntityId: run.legalEntityId, employeeId: s.employeeId, runId: run.id, payslipId: s.id, kind, size, detail });
      const prevNet = D(prev.net);
      if (!prevNet.isZero()) {
        const change = s.net.sub(prevNet).div(prevNet).mul(100);
        if (change.abs().gt(pct)) add('net_change', s.net.sub(prevNet), `Net pay changed by ${change.toFixed(1)}% (from ₹${prevNet.toFixed(2)} to ₹${s.net.toFixed(2)}).`);
      }
      const [now, before] = [codes(s.id), codes(prev.id)];
      for (const x of now) if (!before.has(x)) add('new_component', null, `New this month: ${x}.`);
      for (const x of before) if (!now.has(x)) add('removed_component', null, `Not paid this month: ${x}.`);
    }
    if (rows.length) await tx.varianceFlag.createMany({ data: rows });
  }

  async varianceList(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const run = await this.runIn(tx, c, v, id, VIEW);
      const slips = await tx.payslip.findMany({ where: { organizationId: c.organizationId, runId: run.id, calcVersion: run.calcVersion }, select: { id: true } });
      const rows = await tx.varianceFlag.findMany({ where: { organizationId: c.organizationId, payslipId: { in: slips.map((s) => s.id) } } });
      return rows.map((r) => ({ id: r.id, employeeId: r.employeeId, payslipId: r.payslipId, kind: r.kind, size: r.size?.toFixed(2) ?? null, detail: r.detail, acknowledged: !!r.ackAt, note: r.note }));
    });
  }

  async acknowledge(ctx: TenantContext, user: ScopeUser, id: string, flagId: string, note?: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const run = await this.runIn(tx, c, v, id, ['payroll.run.prepare']);
      const f = await tx.varianceFlag.findFirst({ where: { organizationId: c.organizationId, runId: run.id, id: flagId } });
      if (!f) throw new NotFoundException('Not found');
      if (!f.ackAt) await tx.varianceFlag.update({ where: { id: f.id }, data: { ackBy: v.userId, ackAt: new Date(), note: note ?? null } });
      return { id: f.id, acknowledged: true };
    });
  }

  // ------------------------------------------------------------------------------------------ submit, approve, void (PAY-3.09)

  async submit(ctx: TenantContext, user: ScopeUser, id: string, selfApprovalReason?: string) {
    const v = await this.viewer(user);
    const notices: Notice[] = [];
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const run = await this.runIn(tx, c, v, id, ['payroll.run.prepare']);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`run:${run.id}`}))`;
      const fresh = await tx.payrollRun.findFirstOrThrow({ where: { id: run.id } });
      if (!['calculated', 'in_review'].includes(fresh.status)) throw new ConflictException(`A ${fresh.status} run cannot be submitted.`);
      const slips = await tx.payslip.findMany({ where: { organizationId: org, runId: run.id, calcVersion: run.calcVersion, status: 'draft' }, select: { id: true, net: true } });
      const open = await tx.varianceFlag.count({ where: { organizationId: org, payslipId: { in: slips.map((s) => s.id) }, ackAt: null } });
      if (open) throw new ConflictException(`${open} pay changes need to be confirmed before submitting.`);
      await this.validate(tx, c, fresh, fresh.calcVersion);
      const blocks = (await this.current(tx, org, fresh, fresh.calcVersion)).filter((x) => x.severity === 'block' && x.blocks === 'approval' && !x.waivedBy);
      if (blocks.length) throw new ConflictException({ statusCode: 409, code: 'APPROVAL_BLOCKED', message: blocks.map((x) => x.message).join(' ') });
      const today = todayIst();
      const me = v.userId!;
      const people = (await tx.payslip.findMany({ where: { organizationId: org, runId: run.id, calcVersion: run.calcVersion, status: 'draft' }, select: { employeeId: true } })).map((s) => s.employeeId);
      const makers = new Set<string>([me]);
      for (const r of await tx.lopInput.findMany({ where: { organizationId: org, periodStart: run.periodStart, employeeId: { in: people } }, select: { enteredBy: true } })) makers.add(r.enteredBy);
      for (const r of await tx.specialDays.findMany({ where: { organizationId: org, periodStart: run.periodStart, employeeId: { in: people } }, select: { enteredBy: true } })) makers.add(r.enteredBy);
      for (const r of await tx.oneTimePay.findMany({ where: { organizationId: org, periodStart: { lte: run.periodStart }, status: 'approved', employeeId: { in: people } }, select: { createdBy: true } })) makers.add(r.createdBy);
      // Nobody approves a payroll that pays themselves.
      const paid = new Set((await tx.employee.findMany({ where: { organizationId: org, id: { in: people } }, select: { userId: true } })).map((e) => e.userId).filter((u): u is string => !!u));
      const others = (await payHolders(tx, org, 'payroll.run.approve', run.legalEntityId, today)).filter((u) => !makers.has(u) && !paid.has(u));
      let steps: StepSpec[];
      if (others.length >= 2) {
        steps = [
          { name: 'Payroll approval', approvers: [{ kind: 'users', userIds: others }], mode: 'any', remindAfterHours: 24 },
          { name: 'Final approval', approvers: [{ kind: 'users', userIds: others }], mode: 'any', remindAfterHours: 24 },
        ];
      } else if (others.length === 1) steps = [{ name: 'Payroll approval', approvers: [{ kind: 'users', userIds: others }], mode: 'any', remindAfterHours: 24 }];
      else {
        // P02 Q6 / US-A-154: nobody else can approve; the preparer may, with a reason, and the System Admins are told.
        if (paid.has(me)) throw new BadRequestException('This payroll pays you, so someone else must approve it. Give a second person "payroll.run.approve" for this legal entity.');
        if (!v.grants.has('payroll.run.approve')) throw new BadRequestException('No one else can approve this payroll. Give a second person "payroll.run.approve" for this legal entity.');
        if (!selfApprovalReason) throw new BadRequestException({ statusCode: 400, code: 'SELF_APPROVAL_REASON', message: 'No one else can approve this payroll: give a reason to approve it yourself (the System Admins are told).' });
        steps = [{ name: 'Payroll approval (by the preparer)', approvers: [{ kind: 'users', userIds: [me] }], mode: 'any', selfApproval: 'allowed' }];
      }
      const entity = await tx.legalEntity.findFirstOrThrow({ where: { organizationId: org, id: run.legalEntityId }, select: { name: true } });
      const net = slips.reduce((t, s) => t.add(s.net), D(0));
      const sub = await this.engine.submit(tx, c, {
        type: RUN,
        subjectType: 'payroll_run',
        subjectId: run.id,
        title: `${run.runType === 'regular' ? 'Payroll' : `Off-cycle payroll (${run.offcycleKind === 'fnf' ? 'full and final' : run.offcycleKind})`} for ${monthText(this.month(run))}, ${entity.name}`,
        summary: [
          { label: 'Legal entity', value: entity.name },
          { label: 'Month', value: monthText(this.month(run)) },
          { label: 'People', value: String(slips.length) },
          { label: 'Net pay', value: `₹${net.toFixed(2)}` },
        ],
        subjectPersonId: null,
        requesterUserId: me,
        raisedByUserId: me,
        steps,
        payload: {},
        payloadFields: [],
        fallbackUserIds: [],
        risk: 'high',
      });
      notices.push(...sub.notices);
      if (!others.length) notices.push({ to: await systemAdmins(tx, org), requestId: sub.id, type: 'workflow.approval.needed', title: 'A payroll is being approved by its preparer', link: '/yx/payroll/runs', text: `No one else can approve ${monthText(this.month(run))} for ${entity.name}; the preparer approves it. Reason: ${selfApprovalReason}` });
      await tx.payrollRun.update({ where: { id: run.id }, data: { status: 'submitted', wfRequestId: sub.id, version: { increment: 1 } } });
      await audit(tx, c, 'payroll.run.submitted', 'payroll_run', run.id, { calcVersion: run.calcVersion, people: slips.length, net: net.toFixed(2), selfApproval: !others.length, reason: selfApprovalReason ?? null });
      return { id: run.id, status: 'submitted', approvers: steps.length };
    }, RUN_TX);
    await this.engine.send(ctx, notices);
    return out;
  }

  /** The approver decides on the run's page (step-up by the route): the typed phrase, the people and the net shown. */
  async decide(ctx: TenantContext, user: ScopeUser, id: string, decision: 'approve' | 'reject', reason: string | null, confirmation: ConfirmationDto | undefined) {
    const v = await this.viewer(user);
    const found = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const run = await this.runIn(tx, c, v, id, ['payroll.run.approve']);
      const w = run.wfRequestId ? await tx.wfRequest.findFirst({ where: { organizationId: c.organizationId, id: run.wfRequestId } }) : null;
      const task = w ? await tx.wfTask.findFirst({ where: { organizationId: c.organizationId, requestId: w.id, assigneeUserId: v.userId!, status: 'open', step: w.currentStep } }) : null;
      if (run.status !== 'submitted' || !task) throw new NotFoundException('No such approval.');
      const e = await tx.legalEntity.findFirstOrThrow({ where: { organizationId: c.organizationId, id: run.legalEntityId }, select: { shortName: true } });
      return { taskId: task.id, phrase: approvePhrase(e.shortName, this.month(run)) };
    });
    if (decision === 'approve' && confirmation?.phrase !== found.phrase) throw new BadRequestException(`Type ${found.phrase} to confirm.`);
    const c: CompanyContext = { ...ctx, organizationId: ctx.organizationId!, isSuperAdmin: false };
    return this.engine.decide(c, v.userId!, found.taskId, decision, reason, 'web', { via: RUN, evidence: decision === 'approve' ? { phrase: confirmation!.phrase, impact: confirmation!.impact } : undefined });
  }

  /**
   * The final approval, in the decision's transaction (§9.6): payslips approved (a reopened month's earlier ones revised),
   * the month locked once every regular run of the entity is approved, recoveries settled, cost rates and the journal.
   */
  private async decided(tx: Tx, wf: Prisma.WfRequestGetPayload<object>, outcome: 'approved' | 'rejected') {
    const org = wf.organizationId;
    const c = { organizationId: org, isSuperAdmin: false } as CompanyContext;
    await payScope(tx, [await this.entityOfRun(tx, org, wf.subjectId)]);
    const run = await tx.payrollRun.findFirst({ where: { organizationId: org, id: wf.subjectId } });
    if (!run || run.status !== 'submitted') return;
    await payScope(tx, [run.legalEntityId]);
    if (outcome === 'rejected') {
      await tx.payrollRun.update({ where: { id: run.id }, data: { status: 'in_review', version: { increment: 1 } } });
      await audit(tx, c, 'payroll.run.rejected', 'payroll_run', run.id, {});
      return;
    }
    const slips = await tx.payslip.findMany({ where: { organizationId: org, runId: run.id, calcVersion: run.calcVersion, status: 'draft' } });
    const now = new Date();
    for (const s of slips) {
      if (run.runType === 'regular') await tx.payslip.updateMany({ where: { organizationId: org, employmentId: s.employmentId, periodStart: run.periodStart, subPeriod: run.subPeriod, runType: 'regular', status: 'approved' }, data: { status: 'revised' } });
      await tx.payslip.update({ where: { id: s.id }, data: { status: 'approved', approvedAt: now, paymentStatus: s.held ? 'held' : 'pending' } });
    }
    // Recoveries: loans, court orders and carry-forwards from what each payslip took; new carry-forwards from negative nets.
    for (const s of slips) {
      const snap = await tx.payslipSnapshot.findFirstOrThrow({ where: { payslipId: s.id } });
      const result = calculatePayslip(snap.inputs as unknown as Snapshot, await this.rulesFor(snap.ruleVersions as Record<string, string>));
      // What protected net pay or the deduction cap left for later (APX-B recovery.deferred; M05 shifts its advance schedule).
      for (const d of result.deferred) await tx.eventOutbox.create({ data: { organizationId: org, eventType: 'recovery.deferred', payload: { runId: run.id, payslipId: s.id, employeeId: s.employeeId, kind: d.kind, ref: d.ref } } });
      for (const l of result.recoveries.loans) {
        if (D(l.amount).isZero()) continue;
        await tx.loanRepayment.create({ data: { organizationId: org, legalEntityId: run.legalEntityId, employeeId: s.employeeId, loanId: l.id, payslipId: s.id, amount: l.amount } });
        const loan = await tx.loan.findFirstOrThrow({ where: { organizationId: org, id: l.id } });
        const left = Prisma.Decimal.max(D(0), loan.outstanding.sub(principalPart(loan.outstanding, loan.interestRate, D(l.amount))));
        await tx.loan.update({ where: { id: l.id }, data: { outstanding: left, ...(left.lte(0) ? { status: 'closed' } : {}) } });
      }
      for (const o of result.recoveries.courtOrders) if (!D(o.amount).isZero()) await tx.courtOrder.update({ where: { id: o.id }, data: { remittedTotal: { increment: D(o.amount) } } });
      for (const f of result.recoveries.carryForwards) {
        if (D(f.amount).isZero()) continue;
        const cf = await tx.payCarryForward.findFirstOrThrow({ where: { organizationId: org, id: f.id } });
        const rec = cf.recovered.add(f.amount);
        await tx.payCarryForward.update({ where: { id: f.id }, data: { recovered: rec, ...(rec.gte(cf.amount) ? { status: 'recovered' } : {}) } });
      }
      for (const o of result.recoveries.overpayments) {
        if (D(o.amount).isZero()) continue;
        const op = await tx.overpaymentRecovery.findFirstOrThrow({ where: { organizationId: org, id: o.id } });
        const rec = op.recovered.add(o.amount);
        await tx.overpaymentRecovery.update({ where: { id: o.id }, data: { recovered: rec, version: { increment: 1 }, ...(rec.add(op.writtenOff).gte(op.amount) ? { status: 'recovered' } : {}) } });
      }
      if (D(result.carryForward).gt(0)) await tx.payCarryForward.create({ data: { organizationId: org, legalEntityId: run.legalEntityId, employeeId: s.employeeId, employmentId: s.employmentId, originPayslipId: s.id, amount: result.carryForward } });
      if (s.held) await tx.payrollWithhold.updateMany({ where: { organizationId: org, employmentId: s.employmentId, releasedAt: null }, data: { heldRunId: run.id, amount: s.net } });
      // YX-PAY-42: the employer cost per standard hour of the month.
      if (run.runType !== 'regular') continue;
      const hours = D(await settingFor(tx, c, 'payroll.standard_daily_hours', { legalEntityId: run.legalEntityId })).mul(Number(monthRange(this.month(run)).to.slice(8)));
      await tx.employeeCostRate.upsert({ where: { organizationId_employeeId_periodStart: { organizationId: org, employeeId: s.employeeId, periodStart: run.periodStart } }, update: { employerCost: s.employerCost, standardHours: hours, rate: s.employerCost.div(hours), sourcePayslipId: s.id, provisional: false }, create: { organizationId: org, legalEntityId: run.legalEntityId, employeeId: s.employeeId, periodStart: run.periodStart, employerCost: s.employerCost, standardHours: hours, rate: s.employerCost.div(hours), sourcePayslipId: s.id } });
    }
    await tx.payrollRun.update({ where: { id: run.id }, data: { status: 'approved', approvedAt: now, approvedBy: (await tx.wfAction.findFirst({ where: { organizationId: org, requestId: wf.id, action: { in: ['approved', 'self_approved'] } }, orderBy: { createdAt: 'desc' } }))?.actorUserId ?? null, version: { increment: 1 } } });
    // YX-LOCK-04: the month locks (with attendance and pay-affecting leave) once every regular run of the entity is approved.
    // An F&F settlement is settled once its run (and any second run) is approved and nothing is held back.
    if (run.offcycleKind === 'fnf')
      for (const f of await tx.fnfSettlement.findMany({ where: { organizationId: org, OR: [{ runId: run.id }, { secondRunId: run.id }] } })) {
        // Held lines leave the approved run; once released they go in the second run.
        await tx.oneTimePay.updateMany({ where: { organizationId: org, source: 'fnf', sourceRef: f.id, runId: run.id, holdReason: { not: null } }, data: { runId: null } });
        const held = await tx.oneTimePay.count({ where: { organizationId: org, employmentId: f.employmentId, source: 'fnf', sourceRef: f.id, status: 'approved', holdReason: { not: null } } });
        if (!held && (f.secondRunId === run.id || !f.secondRunId)) await tx.fnfSettlement.update({ where: { id: f.id }, data: { status: 'settled', version: { increment: 1 } } });
      }
    if (run.runType !== 'regular') {
      await audit(tx, c, 'payroll.run.approved', 'payroll_run', run.id, { calcVersion: run.calcVersion, people: slips.length, net: slips.reduce((t, s) => t.add(s.net), D(0)).toFixed(2), offcycle: run.offcycleKind });
      return;
    }
    const waiting = await tx.payrollRun.count({ where: { organizationId: org, legalEntityId: run.legalEntityId, periodStart: run.periodStart, runType: 'regular', status: { notIn: ['approved', 'paid', 'void'] } } });
    const p = await tx.payPeriod.findFirst({ where: { organizationId: org, legalEntityId: run.legalEntityId, payGroupId: null, periodStart: run.periodStart } });
    // A weekly or fortnightly group locks the month only with the run that ends it (PAY-9.01).
    const endsMonth = !run.rangeStart || dateOf(run.periodEnd) === monthRange(this.month(run)).to;
    if (!waiting && endsMonth && p && p.stage !== 'filed') {
      await tx.payPeriod.update({ where: { id: p.id }, data: { stage: 'locked', lockedAt: now, lockedByRunId: run.id, changedAt: now, version: { increment: 1 } } });
      if (p.stage !== 'locked') await tx.periodLockEvent.create({ data: { organizationId: org, payPeriodId: p.id, fromStage: p.stage, toStage: 'locked', byUser: null, reason: 'Payroll approved' } });
      await audit(tx, c, 'period.locked', 'pay_period', p.id, { runId: run.id, month: this.month(run) });
    }
    await audit(tx, c, 'payroll.run.approved', 'payroll_run', run.id, { calcVersion: run.calcVersion, people: slips.length, net: slips.reduce((t, s) => t.add(s.net), D(0)).toFixed(2) });
  }

  /** The rule sets of the versions a payslip used (reproduction reads them, never today's). */
  private async rulesFor(versions: Record<string, string>): Promise<RuleSet[]> {
    const all = await this.rules.published();
    const wanted = Object.entries(versions).map(([k, ver]) => ({ statute: k.split('|')[0], jur: k.split('|')[1], ver }));
    const chosen = all.filter((r) => wanted.some((w) => w.statute === r.statute && w.jur === r.jurisdiction && w.ver === r.version));
    // Rules the payslip did not use stay as they were in force (they made no line), so the hash still matches.
    return [...chosen, ...all.filter((r) => !wanted.some((w) => w.statute === r.statute && w.jur === r.jurisdiction))];
  }

  async void(ctx: TenantContext, user: ScopeUser, id: string, reason: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const run = await this.runIn(tx, c, v, id, ['payroll.run.prepare']);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`run:${run.id}`}))`;
      const fresh = await tx.payrollRun.findFirstOrThrow({ where: { id: run.id } });
      if (['approved', 'paid', 'void', 'submitted'].includes(fresh.status)) throw new ConflictException(fresh.status === 'submitted' ? 'This run is waiting for approval; it can be rejected, not voided.' : `A ${fresh.status} run cannot be voided.`);
      await tx.payslip.updateMany({ where: { organizationId: c.organizationId, runId: run.id, status: 'draft' }, data: { status: 'void', voidReason: 'Run voided' } });
      await tx.payrollRun.update({ where: { id: run.id }, data: { status: 'void', voidReason: reason, version: { increment: 1 } } });
      await tx.eventOutbox.create({ data: { organizationId: c.organizationId, eventType: 'payroll.run.voided', payload: { runId: run.id } } });
      await audit(tx, c, 'payroll.run.voided', 'payroll_run', run.id, { reason });
      return { id: run.id, status: 'void' };
    });
  }

  /** "Reproduce this payslip" (PAY-3.18): run the pure function again from the snapshot with the rule versions it used. */
  async reproduce(ctx: TenantContext, user: ScopeUser, payslipId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await payScope(tx, await entitiesFor(tx, c, v, 'payroll.run.view'));
      const s = await tx.payslip.findFirst({ where: { organizationId: c.organizationId, id: payslipId } });
      const snap = s ? await tx.payslipSnapshot.findFirst({ where: { payslipId: s.id } }) : null;
      if (!s || !snap) throw new NotFoundException('Not found');
      const inputsMatch = hashOf(snap.inputs) === snap.inputsHash;
      const r = calculatePayslip(snap.inputs as unknown as Snapshot, await this.rulesFor(snap.ruleVersions as Record<string, string>));
      const same = inputsMatch && r.resultHash === s.resultHash;
      await audit(tx, c, 'payroll.payslip.reproduced', 'payslip', s.id, { same, engineVersion: snap.engineVersion });
      return { payslipId: s.id, same, inputsMatch, storedHash: s.resultHash, reproducedHash: r.resultHash, engineVersion: snap.engineVersion, net: r.net };
    });
  }



}
