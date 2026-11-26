import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { fillInjuryDays } from './injury-days';
import { ModuleRef } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { lapsedWorkPermits } from '../people/work-auth.service';
import type { ScopeUser, Viewer } from '../access/scope';
import { REDIS_CONNECTION, logBullErrors, bullOpts } from '../jobs/redis-connection';
import { StatutoryRulesService } from '../statutory/statutory.service';
import { StatutoryError, empDefaults, esiCovered, inForce, ptCharged, type RuleSet } from '../statutory/evaluator';
import { asDate, dateOf, factsOn, monthRange, settingOn } from '../time/time-core';
import { subPeriods } from './frequency';
import { addDays } from '../time/time-maths';
import { PeriodsService as TimePeriodsService } from '../time/periods.service';
import { ApprovalsEngine, type Notice, type StepSpec } from '../workflow/approvals-engine.service';
import { ENGINE_VERSION, calculatePayslip, hashOf, type CalcComponent, type Segment, type Snapshot } from './calc';
import { LISTED_SOURCES, PAID_SOURCES, componentDifference, correctionPaid, correctionLabel, monthOf, paidCorrections, shouldBeLop, wasLop, withDayChanged } from './late-corrections';
import { monthRun } from './month-run';
import type { ConfirmationDto } from './dto';
import { principalPart } from './inputs.service';
import { dayKinds } from './payslip-days';
import { buildTaxInputs } from './tax.service';
import { taxYearOf } from './tax';
import { waitingForIfsc } from './payout.service';
import { periodDates } from './pay-dates';
import { RETRENCHMENT_CODES, retrenchmentPermission } from './fnf.service';
import { PayKey, entitiesFor, payHolders, payScope, payViewer, publishesAlone, requireEntity, requireSelf, systemAdmins, withPayScope } from './pay-access';

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
/** The perquisites payroll writes itself are entered by no person. */
const SYSTEM_USER = '00000000-0000-0000-0000-000000000000';
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
    this.queue = logBullErrors(new Queue(QUEUE, bullOpts(connection)), QUEUE);
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
    this.worker = logBullErrors(new Worker(QUEUE, (job) => this.calculateChunk(job.data as { org: string; runId: string; version: number; ids: string[] }), { ...bullOpts(this.connection), concurrency: CONCURRENCY }), QUEUE);
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
    return { id: r.id, reference: r.reference, legalEntityId: r.legalEntityId, payGroupId: r.payGroupId, month: this.month(r), subPeriod: r.subPeriod || null, range: r.rangeStart ? { from: dateOf(r.rangeStart), to: dateOf(r.periodEnd) } : null, runType: r.runType, offcycleKind: r.offcycleKind, status: r.status, publishedAt: r.publishedAt, releaseAt: r.releaseAt, releaseReason: r.releaseReason, calcVersion: r.calcVersion, totals: r.totals, preparedBy: r.preparedBy, approvedAt: r.approvedAt, voidReason: r.voidReason, createdAt: r.createdAt };
  }

  async list(ctx: TenantContext, user: ScopeUser, month?: string, entityId?: string | null) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = [...new Set((await Promise.all(VIEW.map((k) => entitiesFor(tx, c, v, k)))).flat())].filter((id) => !entityId || id === entityId);
      await payScope(tx, ids);
      const rows = await tx.payrollRun.findMany({ where: { organizationId: c.organizationId, legalEntityId: { in: ids }, ...(month ? { periodStart: asDate(`${month}-01`) } : {}) }, orderBy: [{ periodStart: 'desc' }, { createdAt: 'desc' }], take: 200 });
      return rows.map((r) => this.view(r));
    });
  }

  /**
   * Home (PLT-02 "Not ready for payroll"): people in the month's open regular runs who still have a blocking check
   * (unwaived), as the last readiness check or calculation left them; this never re-runs the checks. Null without
   * payroll.run.prepare or when no run is open for the month.
   */
  async notReady(ctx: TenantContext, user: ScopeUser, month: string, entityId?: string | null): Promise<{ notReady: number; people: number; runId: string | null } | null> {
    const v = await this.viewer(user);
    if (!v.grants.has('payroll.run.prepare') || v.actingForOther) return null;
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = (await entitiesFor(tx, c, v, 'payroll.run.prepare')).filter((id) => !entityId || id === entityId);
      await payScope(tx, ids);
      return this.notReadyIn(tx, c.organizationId, ids, month);
    }, RUN_TX);
  }

  /**
   * A3 (batch H part 2, answer 2409): who is not ready for payroll today, for the People directory: current employees
   * of the entities the viewer prepares runs for, with what is missing (a salary, a salary bank account, a PAN). The
   * same checks as a run's; nothing about amounts. Null without payroll.run.prepare or when acting for someone.
   */
  async notReadyPeople(ctx: TenantContext, user: ScopeUser, entityId?: string | null): Promise<{ employeeId: string; missing: ('salary' | 'bank' | 'pan')[] }[] | null> {
    const v = await this.viewer(user);
    if (!v.grants.has('payroll.run.prepare') || v.actingForOther) return null;
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const ids = (await entitiesFor(tx, c, v, 'payroll.run.prepare')).filter((id) => !entityId || id === entityId);
      if (!ids.length) return [];
      await payScope(tx, ids);
      const today = asDate(todayIst());
      const ems = await tx.employment.findMany({ where: { organizationId: org, legalEntityId: { in: ids }, joinedOn: { lte: today }, OR: [{ exitedOn: null }, { exitedOn: { gte: today } }] }, select: { id: true, employeeId: true } });
      if (!ems.length) return [];
      const comps = new Set((await tx.compensation.findMany({ where: { organizationId: org, employmentId: { in: ems.map((e) => e.id) }, supersededAt: null, validFrom: { lte: today }, OR: [{ validTo: null }, { validTo: { gte: today } }] }, select: { employmentId: true } })).map((x) => x.employmentId));
      const people = ems.map((e) => e.employeeId);
      const banks = new Set((await tx.employeeBankAccount.findMany({ where: { organizationId: org, employeeId: { in: people }, purpose: 'salary', validTo: null }, select: { employeeId: true } })).map((x) => x.employeeId));
      const pans = new Set((await tx.employeeIdentifiers.findMany({ where: { organizationId: org, employeeId: { in: people }, panHash: { not: null } }, select: { employeeId: true } })).map((x) => x.employeeId));
      const out: { employeeId: string; missing: ('salary' | 'bank' | 'pan')[] }[] = [];
      for (const e of ems) {
        const missing = [...(comps.has(e.id) ? [] : (['salary'] as const)), ...(banks.has(e.employeeId) ? [] : (['bank'] as const)), ...(pans.has(e.employeeId) ? [] : (['pan'] as const))];
        if (missing.length) out.push({ employeeId: e.employeeId, missing });
      }
      return out;
    }, RUN_TX);
  }

  /** People blocked from the month's open regular runs of these entities (the pay guard must already cover them). */
  async notReadyIn(tx: Tx, org: string, ids: string[], month: string): Promise<{ notReady: number; people: number; runId: string | null } | null> {
    const runs = await tx.payrollRun.findMany({ where: { organizationId: org, legalEntityId: { in: ids }, runType: 'regular', periodStart: asDate(`${month}-01`), status: { in: ['draft', 'calculated', 'in_review', 'reopened'] } } });
    if (!runs.length) return null;
    let people = 0;
    const blocked = new Set<string>();
    for (const run of runs) {
      people += (await this.members(tx, org, run)).length;
      for (const x of await this.current(tx, org, run)) if (x.severity === 'block' && !x.waivedBy && x.employeeId) blocked.add(`${run.id}:${x.employeeId}`);
    }
    return { notReady: blocked.size, people, runId: runs.length === 1 ? runs[0].id : null };
  }

  /**
   * Home (PLT-02 finance): the regular runs of these months that the person may see (payroll.run.view, prepare or
   * approve), with headcount, net, pay date, who prepared them and whether the person approves one now. Null without
   * any of those keys.
   */
  async homeRuns(ctx: TenantContext, user: ScopeUser, months: string[], entityId?: string | null) {
    const v = await payViewer(this.prisma, this.tenantPrisma, user);
    if (v.actingForOther || !v.userId || !VIEW.some((k) => v.grants.has(k))) return null;
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const ids = [...new Set((await Promise.all(VIEW.map((k) => entitiesFor(tx, c, v, k)))).flat())].filter((id) => !entityId || id === entityId);
      await payScope(tx, ids);
      const runs = await tx.payrollRun.findMany({ where: { organizationId: org, legalEntityId: { in: ids }, runType: 'regular', status: { not: 'void' }, periodStart: { in: [...new Set(months)].map((m) => asDate(`${m}-01`)) } }, orderBy: { periodStart: 'asc' } });
      const groups = await tx.payGroup.findMany({ where: { organizationId: org, id: { in: runs.map((r) => r.payGroupId) } }, select: { id: true, payDay: true } });
      const users = await tx.user.findMany({ where: { organizationId: org, id: { in: runs.map((r) => r.preparedBy) } }, select: { id: true, name: true, email: true } });
      const entities = await tx.legalEntity.findMany({ where: { organizationId: org, id: { in: runs.map((r) => r.legalEntityId) } }, select: { id: true, name: true } });
      const mine = await tx.wfTask.findMany({ where: { organizationId: org, assigneeUserId: v.userId!, status: 'open', requestId: { in: runs.flatMap((r) => (r.wfRequestId ? [r.wfRequestId] : [])) } }, select: { requestId: true } });
      const requests = await tx.wfRequest.findMany({ where: { organizationId: org, id: { in: runs.flatMap((r) => (r.wfRequestId ? [r.wfRequestId] : [])) } }, select: { id: true, createdAt: true } });
      // People whose net pay changed by more than the company's threshold (the run's variance review, current calculation).
      const flagged = await tx.$queryRaw<{ run_id: string; n: number }[]>`
        SELECT f.run_id::text, count(DISTINCT f.employee_id)::int AS n FROM variance_flags f JOIN payslips p ON p.id = f.payslip_id
        JOIN payroll_runs r ON r.id = f.run_id AND p.calc_version = r.calc_version
        WHERE f.organization_id = ${org}::uuid AND f.run_id = ANY(${runs.map((r) => r.id)}::uuid[]) AND f.kind = 'net_change'
        GROUP BY f.run_id`;
      // The preparer's designation, from their employee record when they have one.
      const roles = await tx.$queryRaw<{ user_id: string; name: string }[]>`
        SELECT e.user_id::text, d.name FROM employees e JOIN employee_assignments a ON a.organization_id = e.organization_id AND a.employee_id = e.id
          AND a.superseded_at IS NULL AND current_date <@ daterange(a.valid_from, a.valid_to, '[]')
        JOIN designations d ON d.id = a.designation_id
        WHERE e.organization_id = ${org}::uuid AND e.user_id = ANY(${[...new Set(runs.map((r) => r.preparedBy))]}::uuid[])`;
      const threshold = new Map<string, string>();
      for (const id of new Set(runs.map((r) => r.legalEntityId))) threshold.set(id, String(await settingFor(tx, c, 'payroll.variance_threshold_pct', { legalEntityId: id })));
      return runs.map((r) => {
        const t = (r.totals ?? {}) as { people?: number; net?: string | number };
        const payDay = groups.find((g) => g.id === r.payGroupId)?.payDay ?? 0;
        const u = users.find((x) => x.id === r.preparedBy);
        return {
          id: r.id,
          month: this.month(r),
          entity: entities.find((e) => e.id === r.legalEntityId)?.name ?? '',
          status: r.status,
          people: t.people ?? null,
          net: t.net === undefined ? null : D(t.net).toFixed(2),
          // The pay calendar's rule (setup): the period's last day, or that many days after it.
          payOn: addDays(dateOf(r.periodEnd), payDay),
          preparedBy: u?.name || u?.email || '',
          preparedByMe: r.preparedBy === v.userId,
          requestId: r.wfRequestId,
          approveNow: mine.some((x) => x.requestId === r.wfRequestId) && r.status === 'submitted',
          preparedRole: roles.find((x) => x.user_id === r.preparedBy)?.name ?? null,
          submittedOn: requests.find((x) => x.id === r.wfRequestId)?.createdAt.toISOString() ?? null,
          variance: { flagged: flagged.find((x) => x.run_id === r.id)?.n ?? 0, threshold: threshold.get(r.legalEntityId) ?? '10' },
        };
      });
    });
  }

  /**
   * Home (PLT-02 "Payroll cost vs budget"): cost to company of each month's regular runs (not void) against the payroll
   * budget, for the entities whose runs the person sees. A month's budget shows only when every entity with a cost that
   * month has one (a part budget would mislead). Null without a run key.
   */
  async homeCost(ctx: TenantContext, user: ScopeUser, months: string[], entityId?: string | null) {
    const v = await payViewer(this.prisma, this.tenantPrisma, user);
    if (v.actingForOther || !v.userId || !VIEW.some((k) => v.grants.has(k))) return null;
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const ids = [...new Set((await Promise.all(VIEW.map((k) => entitiesFor(tx, c, v, k)))).flat())].filter((id) => !entityId || id === entityId);
      await payScope(tx, ids);
      const starts = months.map((m) => asDate(`${m}-01`));
      const runs = await tx.payrollRun.findMany({ where: { organizationId: org, legalEntityId: { in: ids }, runType: 'regular', status: { not: 'void' }, periodStart: { in: starts } }, select: { legalEntityId: true, periodStart: true, totals: true } });
      const budgets = await tx.payrollBudget.findMany({ where: { organizationId: org, legalEntityId: { in: ids }, month: { in: starts } } });
      const setup = await entitiesFor(tx, c, v, 'payroll.setup.manage');
      return {
        canSetBudget: ids.some((id) => setup.includes(id)),
        months: months.map((m) => {
          const mine = runs.filter((r) => dateOf(r.periodStart).startsWith(m));
          const costs = mine.map((r) => (r.totals as { employerCost?: string | number } | null)?.employerCost);
          const cost = costs.length && costs.every((x) => x !== undefined && x !== null) ? costs.reduce<Prisma.Decimal>((t, x) => t.add(x!), D(0)) : null;
          const set = budgets.filter((b) => dateOf(b.month).startsWith(m));
          const covered = set.length > 0 && [...new Set(mine.map((r) => r.legalEntityId))].every((id) => set.some((b) => b.legalEntityId === id));
          return { month: m, cost: cost?.toFixed(2) ?? null, budget: covered ? set.reduce((t, b) => t.add(b.amount), D(0)).toFixed(2) : null };
        }),
      };
    });
  }

  /** The payroll-run entities this person prepares runs for ([] without the key or when acting for someone else). */
  async preparesFor(ctx: TenantContext, user: ScopeUser): Promise<string[]> {
    const v = await this.viewer(user);
    if (!v.grants.has('payroll.run.prepare') || v.actingForOther) return [];
    return inCompany(this.tenantPrisma, ctx, (tx, c) => entitiesFor(tx, c, v, 'payroll.run.prepare'));
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
      // PAY-09: the sole payroll admin is asked for a reason in the publish sheet before pressing publish.
      const publishAlone = ['approved', 'paid'].includes(run.status) && !run.publishedAt && v.grants.has('payroll.payslip.publish') ? await publishesAlone(tx, c.organizationId, run.legalEntityId, v.userId!) : false;
      // PAY-29: a weekly or fortnightly group's run opens in the design's step view (its group and frequency).
      const payGroup = await tx.payGroup.findFirst({ where: { organizationId: c.organizationId, id: run.payGroupId }, select: { name: true, frequency: true } });
      return { ...this.view(run), entityName: e.name, preparedByMe: run.preparedBy === v.userId, approval, publishAlone, payGroup };
    });
  }

  /**
   * PAY-19 "Deduction cap check": one payslip's deductions in the legal order, what each wanted, what it took and what the
   * cap or the protected net deferred to the next run, worked out again from the payslip's frozen inputs.
   */
  async deductionCap(ctx: TenantContext, user: ScopeUser, payslipId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = [...new Set((await Promise.all(VIEW.map((k) => entitiesFor(tx, c, v, k)))).flat())];
      await payScope(tx, ids);
      const s = await tx.payslip.findFirst({ where: { organizationId: c.organizationId, id: payslipId } });
      if (!s || !ids.includes(s.legalEntityId)) throw new NotFoundException('Not found');
      const snap = await tx.payslipSnapshot.findFirst({ where: { organizationId: c.organizationId, payslipId: s.id } });
      if (!snap) throw new NotFoundException('Not found');
      const input = snap.inputs as unknown as Snapshot;
      const r = calculatePayslip(input, await this.rulesFor(snap.ruleVersions as Record<string, string>));
      const refOf = new Map<string, string>(input.recoveries.courtOrders.map((o) => [o.id, o.ref]));
      const deferredOf = (kind: string, ref: string) => r.deferred.filter((d) => d.kind === kind && d.ref === ref).reduce((t, d) => t.add(d.amount), D(0));
      const KIND: Record<string, string> = { court_attachment: 'court_order', loan_emi: 'loan', carry_forward_recovery: 'carry_forward', overpayment_recovery: 'overpayment' };
      const recoveries = r.lines
        .filter((l) => KIND[l.code] && l.sourceRef)
        .map((l) => {
          const deferred = deferredOf(KIND[l.code], KIND[l.code] === 'court_order' ? (refOf.get(l.sourceRef!) ?? l.sourceRef!) : l.sourceRef!);
          return { label: l.name, kind: KIND[l.code], due: D(l.amount).add(deferred).toFixed(2), deducted: D(l.amount).toFixed(2), deferred: deferred.toFixed(2) };
        });
      return { payslipId: s.id, employeeId: s.employeeId, month: dateOf(s.periodStart).slice(0, 7), wages: r.cap?.wages ?? r.gross, cap: r.cap?.limit ?? null, protectedNet: r.cap?.protectedNet ?? null, net: r.net, lines: [{ label: 'Statutory (PF, ESI, PT, TDS)', kind: 'statutory', due: r.cap?.statutory ?? '0.00', deducted: r.cap?.statutory ?? '0.00', deferred: '0.00' }, ...recoveries] };
    });
  }

  /** PAY-19: the payslips whose recoveries the cap or the protected net deferred (from the approval's deferral events). */
  async deferrals(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = [...new Set((await Promise.all(VIEW.map((k) => entitiesFor(tx, c, v, k)))).flat())];
      await payScope(tx, ids);
      const events = await tx.eventOutbox.findMany({ where: { organizationId: c.organizationId, eventType: 'recovery.deferred' }, orderBy: { occurredAt: 'desc' }, take: 500, select: { payload: true } });
      const bySlip = new Map<string, string[]>();
      for (const e of events) {
        const p = e.payload as { payslipId?: string; kind?: string };
        if (p.payslipId) bySlip.set(p.payslipId, [...(bySlip.get(p.payslipId) ?? []), p.kind ?? 'recovery']);
      }
      const slips = await tx.payslip.findMany({ where: { organizationId: c.organizationId, id: { in: [...bySlip.keys()] }, legalEntityId: { in: ids } }, orderBy: { periodStart: 'desc' } });
      return slips.map((s) => ({ payslipId: s.id, employeeId: s.employeeId, month: dateOf(s.periodStart).slice(0, 7), kinds: [...new Set(bySlip.get(s.id))] }));
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

  /** In an off-cycle bonus run: the employments whose approved items in it are all bonus lines (item 29). */
  private async bonusOnly(tx: Tx, org: string, run: Run): Promise<Set<string>> {
    if (run.runType !== 'offcycle' || run.offcycleKind !== 'bonus') return new Set();
    const items = await withPayScope(tx, [run.legalEntityId], () => tx.oneTimePay.findMany({ where: { organizationId: org, runId: run.id, status: 'approved', holdReason: null }, select: { employmentId: true, componentCode: true } }));
    const other = new Set(items.filter((x) => x.componentCode !== 'bonus').map((x) => x.employmentId));
    return new Set(items.map((x) => x.employmentId).filter((x) => !other.has(x)));
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
    // No compensation: that person is left out of this run. Founder 30 Oct 2026 (item 29): an off-cycle bonus run pays a
    // leaver's bonus, so someone whose items in it are all bonus lines needs no salary this month.
    const comps = await withPayScope(tx, [run.legalEntityId], () => tx.compensation.findMany({ where: { organizationId: org, employmentId: { in: members.map((m) => m.employmentId) }, supersededAt: null, validFrom: { lte: run.periodEnd }, OR: [{ validTo: null }, { validTo: { gte: run.periodStart } }] }, select: { employmentId: true } }));
    const bonusOnly = await this.bonusOnly(tx, org, run);
    for (const m of members) if (!bonusOnly.has(m.employmentId) && !comps.some((x) => x.employmentId === m.employmentId)) found.push({ employeeId: m.employeeId, checkKey: 'no_compensation', severity: 'block', waivable: false, message: `${m.name}: no salary for this month; left out of the run until one is approved.` });
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
    // PPL-10: what is still open after a move into this entity (PF, ESI, tax, pay) shows here until done.
    const moved = await tx.continuityItem.groupBy({ by: ['employeeId'], where: { organizationId: org, legalEntityId: run.legalEntityId, status: 'open', employeeId: { in: ids } }, _count: { _all: true } });
    for (const x of moved) found.push({ employeeId: x.employeeId, checkKey: 'transfer_continuity', severity: 'warn', message: `${nameOf(x.employeeId)}: ${x._count._all} continuity ${x._count._all === 1 ? 'item is' : 'items are'} open after the move to this entity (People › Restructure).` });
    const lop = await withPayScope(tx, [run.legalEntityId], () => tx.lopInput.findMany({ where: { organizationId: org, periodStart: run.periodStart, employeeId: { in: ids } } }));
    const days = Number(monthRange(month).to.slice(8));
    for (const l of lop) if (D(l.lopDays).gt(days)) found.push({ employeeId: l.employeeId, checkKey: 'lop_too_many', severity: 'block', message: `${nameOf(l.employeeId)}: ${l.lopDays.toString()} loss-of-pay days in a ${days}-day month.` });
    const pendingOneTime = await withPayScope(tx, [run.legalEntityId], () => tx.oneTimePay.count({ where: { organizationId: org, employeeId: { in: ids }, status: 'pending', periodStart: { lte: run.periodStart } } }));
    if (pendingOneTime) found.push({ employeeId: null, checkKey: 'one_time_pending', severity: 'warn', message: `${pendingOneTime} one-time payments are still waiting for approval; they are paid when approved.` });
    const pendingLoans = await withPayScope(tx, [run.legalEntityId], () => tx.loan.count({ where: { organizationId: org, employeeId: { in: ids }, status: 'requested' } }));
    if (pendingLoans) found.push({ employeeId: null, checkKey: 'loans_pending', severity: 'warn', message: `${pendingLoans} loan requests are still waiting for approval.` });
    // D14 (answer 2404): a loan that carries a loan perquisite while its SBI rate is not loaded: nothing is worked out for it.
    const owed = await withPayScope(tx, [run.legalEntityId], () => tx.loan.findMany({ where: { organizationId: org, employeeId: { in: ids }, status: { in: ['active', 'paused'] }, loanType: { in: ['loan', 'advance'] }, outstanding: { gt: 0 } }, select: { employeeId: true, perqPurpose: true, perqExempt: true, outstanding: true } }));
    if (owed.length) {
      const perqRs = inForce(await this.rules.published(), 'IN.PERQ-LOAN', ['IN'], dateOf(run.periodEnd));
      const rates = (perqRs?.values.rates ?? {}) as Record<string, string | null>;
      const small = (id: string) => !!perqRs && owed.filter((l) => l.employeeId === id).reduce((t, l) => t.add(l.outstanding), D(0)).lte(D(perqRs.values.exemptAggregate as string));
      const missing = new Set(owed.filter((l) => !l.perqExempt && (rates[l.perqPurpose] ?? null) === null && !small(l.employeeId)).map((l) => l.employeeId));
      for (const id of missing) found.push({ employeeId: id, checkKey: 'loan_perq_rates', severity: 'warn', message: `${nameOf(id)}: loan perquisite rates are not loaded, so no loan perquisite is worked out. Ask your CA to load the SBI rates.` });
    }
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
    // A2 (answers 2400-2402): approval waits for the entity's TAN and PAN, and for a PT registration ("registered" or
    // "applied, awaiting") in each state where someone in this run works and the state's PT rule in force charges PT.
    // Never waived. A person's own missing PAN stays the warning above.
    for (const g of await approvalGaps(tx, org, run, members, await this.rules.published())) found.push({ employeeId: null, severity: 'block', blocks: 'approval', waivable: false, ...g });
    // PAY-11 Retrenchment: retrenchment lines in this run need the government's permission recorded in People › Exits
    // when the establishment is at the IN.IR threshold; approval waits for it (never waived; the held lines say so too).
    if (run.offcycleKind === 'fnf') {
      for (const f of await tx.fnfSettlement.findMany({ where: { organizationId: org, exitType: 'retrenchment', OR: [{ runId: run.id }, { secondRunId: run.id }] } })) {
        const lines = await tx.oneTimePay.count({ where: { organizationId: org, runId: run.id, source: 'fnf', sourceRef: f.id, status: 'approved', holdReason: null, componentCode: { in: RETRENCHMENT_CODES } } });
        const perm = lines ? await retrenchmentPermission(tx, org, f, await this.rules.published()) : null;
        if (perm?.needed && !perm.granted)
          found.push({ employeeId: f.employeeId, checkKey: 'retrenchment_permission', severity: 'block', blocks: 'approval', waivable: false, message: `${nameOf(f.employeeId)}: retrenchment needs the government's permission (${perm.workers} workers). Record it as granted in People › Exits before approval.` });
      }
    }
    // PPL-45: an expired employment visa or work permit for the entity's country holds approval (WPS files fail on it).
    const country = (await tx.legalEntity.findFirstOrThrow({ where: { organizationId: org, id: run.legalEntityId }, select: { country: true } })).country;
    for (const id of await lapsedWorkPermits(tx, org, country, ids, run.periodEnd)) found.push({ employeeId: id, checkKey: 'work_permit_expired', severity: 'block', blocks: 'approval', message: `${nameOf(id)}: the employment visa or work permit has expired. Record the renewal on their record before approval.` });
    await tx.runValidation.createMany({
      data: found.map((f) => {
        const w = old.find((o) => o.checkKey === f.checkKey && o.employeeId === f.employeeId);
        return { organizationId: org, legalEntityId: run.legalEntityId, runId: run.id, calcVersion: generation, employeeId: f.employeeId, checkKey: f.checkKey, severity: f.severity, blocks: f.blocks ?? 'calculation', waivable: f.waivable ?? true, message: f.message.slice(0, 500), ...(w && (f.waivable ?? true) ? { waivedBy: w.waivedBy, waiverReason: w.waiverReason, waivedAt: w.waivedAt } : {}) };
      }),
    });
  }

  private async current(tx: Tx, org: string, run: Run, generation?: number) {
    const g = generation ?? (await tx.runValidation.aggregate({ where: { organizationId: org, runId: run.id }, _max: { calcVersion: true } }))._max.calcVersion;
    if (g === null) return [];
    // A generation can be checked more than once (readiness, then calculate or submit): only the latest pass counts, so a
    // cause fixed since (a permission recorded, a bank account added) no longer blocks. Rows are never deleted (audit).
    const rows = await tx.runValidation.findMany({ where: { organizationId: org, runId: run.id, calcVersion: g }, orderBy: [{ severity: 'asc' }, { checkKey: 'asc' }] });
    const last = Math.max(...rows.map((r) => r.createdAt.getTime()));
    return rows.filter((r) => r.createdAt.getTime() === last);
  }

  /** The readiness screen: people, attendance feed state, and the checks as they stand now (refreshed). */
  /**
   * Enterprise E5 (O17, PAY-02): the run's input cut-off and payslip release dates (its pay group's, or the month's own),
   * whether this person may change them, and the one-time items that came after a cut-off: rolled into this run, or
   * asked for this month and rolled on.
   */
  private async datesAndLate(tx: Tx, c: CompanyContext, v: Viewer, run: Prisma.PayrollRunGetPayload<object>, members: { employmentId: string; employeeId: string }[]) {
    const org = c.organizationId;
    const g = run.runType === 'regular' ? await tx.payGroup.findFirst({ where: { organizationId: org, id: run.payGroupId } }) : null;
    const month = dateOf(run.periodStart).slice(0, 7);
    const dates = g && g.frequency === 'monthly' ? { payGroup: { id: g.id, name: g.name }, ...(await periodDates(tx, org, g, month)), canChange: (await entitiesFor(tx, c, v, 'payroll.setup.manage')).includes(run.legalEntityId) && !v.actingForOther } : null;
    if (!dates) return { dates: null, late: [] };
    const ids = members.map((m) => m.employmentId);
    const rows = await tx.oneTimePay.findMany({ where: { organizationId: org, employmentId: { in: ids }, status: { in: ['approved', 'pending'] }, OR: [{ periodStart: run.periodStart, rolledFrom: { not: null } }, { rolledFrom: run.periodStart }] }, orderBy: { createdAt: 'asc' }, take: 500 });
    const names = new Map((await tx.employee.findMany({ where: { organizationId: org, id: { in: rows.map((r) => r.employeeId) } }, select: { id: true, givenName: true, familyName: true, preferredName: true } })).map((p) => [p.id, [p.preferredName ?? p.givenName, p.familyName].filter(Boolean).join(' ')]));
    const comps = new Map((await tx.payComponent.findMany({ where: { organizationId: org, code: { in: [...new Set(rows.map((r) => r.componentCode))] } }, select: { code: true, name: true } })).map((x) => [x.code, x.name]));
    const late = rows.map((r) => ({ id: r.id, employeeId: r.employeeId, name: names.get(r.employeeId) ?? '', component: comps.get(r.componentCode) ?? r.componentCode, amount: r.amount.toFixed(2), from: dateOf(r.rolledFrom!).slice(0, 7), to: dateOf(r.periodStart).slice(0, 7), direction: dateOf(r.periodStart) === dateOf(run.periodStart) ? ('in' as const) : ('out' as const) }));
    return { dates, late };
  }

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
      const groups = run.runType === 'regular' ? await this.attendanceGroups(tx, c, run, members) : [];
      return { run: this.view(run), people: members.length, period: period?.stage ?? 'open', groups, ...(await this.datesAndLate(tx, c, v, run, members)), checks: checks.map((x) => ({ id: x.id, employeeId: x.employeeId, checkKey: x.checkKey, severity: x.severity, blocks: x.blocks, waivable: x.waivable, message: x.message, waived: !!x.waivedBy, waiverReason: x.waiverReason })) };
    }, RUN_TX);
  }

  /**
   * PAY-02 "Attendance mode per group": the run's people by location and attendance mode (the dated company settings
   * attendance.mode and attendance.missing_punch_effect as they stand on the period's last day), with their open
   * attendance exceptions in the period and, for assumed-present groups, how many have a manual LOP entry.
   * shortcut: one facts read per person; fine for a few thousand people, batch the facts when runs grow past that.
   */
  private async attendanceGroups(tx: Tx, c: CompanyContext, run: Run, members: Member[]) {
    const org = c.organizationId;
    const on = dateOf(run.periodEnd);
    const ids = members.map((m) => m.employeeId);
    const open = ids.length ? await tx.attendanceDay.groupBy({ by: ['employeeId'], where: { organizationId: org, employeeId: { in: ids }, workOn: { gte: run.periodStart, lte: run.periodEnd }, status: { in: ['missing_in', 'missing_out', 'no_timesheet'] } }, _count: { _all: true } }) : [];
    const lop = new Set((await withPayScope(tx, [run.legalEntityId], () => tx.lopInput.findMany({ where: { organizationId: org, periodStart: run.periodStart, employeeId: { in: ids } }, select: { employeeId: true } }))).map((l) => l.employeeId));
    const locations = new Map((await tx.location.findMany({ where: { organizationId: org, legalEntityId: run.legalEntityId }, select: { id: true, name: true } })).map((l) => [l.id, l.name]));
    const period = await tx.payPeriod.findFirst({ where: { organizationId: org, legalEntityId: run.legalEntityId, payGroupId: null, periodStart: run.periodStart } });
    const out = new Map<string, { group: string; mode: 'punch_block' | 'punch_warn' | 'assumed_present' | 'timesheet'; employees: number; exceptions: number; lopEntered: number }>();
    for (const m of members) {
      const f = await factsOn(tx, org, m.employeeId, on);
      if (!f) continue;
      const set = await settingOn(tx, c, 'attendance.mode', f, on);
      const mode = set === 'assumed_present' ? 'assumed_present' : set === 'timesheet' ? 'timesheet' : (await settingOn(tx, c, 'attendance.missing_punch_effect', f, on)) === 'warning_only' ? 'punch_warn' : 'punch_block';
      const group = locations.get(f.locationId) ?? 'Other locations';
      const g = out.get(`${group}|${mode}`) ?? { group, mode, employees: 0, exceptions: 0, lopEntered: 0 };
      g.employees++;
      g.exceptions += open.find((x) => x.employeeId === m.employeeId)?._count._all ?? 0;
      if (lop.has(m.employeeId)) g.lopEntered++;
      out.set(`${group}|${mode}`, g);
    }
    return [...out.values()].sort((a, b) => a.group.localeCompare(b.group) || a.mode.localeCompare(b.mode)).map((g) => ({ ...g, attendanceStage: period?.stage ?? 'open' }));
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
      // HLP-12 answer 65: injury days up to date from approved injury leave (a locked month is never changed).
      if (run.runType === 'regular') await fillInjuryDays(tx, c, run.legalEntityId, this.month(run), todayIst());
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
          : await tx.payPeriod.create({ data: { organizationId: org, legalEntityId: run.legalEntityId, periodStart: run.periodStart, periodEnd: asDate(monthRange(this.month(run)).to), stage: 'frozen', changedBy: v.userId } });
        await tx.periodLockEvent.create({ data: { organizationId: org, payPeriodId: period.id, fromStage: 'open', toStage: 'frozen', byUser: v.userId, reason: 'Payroll calculation started' } });
        const time = this.moduleRef.get(TimePeriodsService, { strict: false });
        const rows = time ? await time.feedRows(tx, c, run.legalEntityId, month) : [];
        await tx.payrollFeedRow.updateMany({ where: { organizationId: org, payPeriodId: period.id, supersededAt: null }, data: { supersededAt: new Date() } });
        if (rows.length) await tx.payrollFeedRow.createMany({ data: rows.map((r) => ({ organizationId: org, payPeriodId: period.id, legalEntityId: run.legalEntityId, periodStart: run.periodStart, employeeId: r.employeeId, mode: r.mode, calendarDays: r.calendarDays, paidDays: r.paidDays, lopDays: r.lopDays, otNormalMinutes: r.otNormalMinutes, otWeeklyOffMinutes: r.otWeeklyOffMinutes, otHolidayMinutes: r.otHolidayMinutes, nightShifts: r.nightShifts, compOffDays: r.compOffDays, timesheetMinutes: r.timesheetMinutes, layoffDays: r.layoffDays, heldDays: r.heldDays, lateLopDays: r.lateLopDays })) });
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

  /** PAY-03 "Failed": queues again only the people whose last calculation failed, in the same calculation (the others
   * keep their draft payslips); the checks of that calculation stand. One at a time (the run's advisory lock). */
  async retryFailed(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const run0 = await this.runIn(tx, c, v, id, ['payroll.run.prepare']);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`run:${run0.id}`}))`;
      const run = await tx.payrollRun.findFirstOrThrow({ where: { id: run0.id } });
      if (run.status === 'calculating') throw new ConflictException('The run is calculating. Wait until it finishes.');
      const failed = run.status === 'draft' && run.calcVersion ? await tx.runEmployee.findMany({ where: { organizationId: org, runId: run.id, calcVersion: run.calcVersion, state: 'failed' } }) : [];
      if (!failed.length) throw new ConflictException('No one failed in the last calculation. Use Calculate to work out the whole run again.');
      await tx.runEmployee.updateMany({ where: { organizationId: org, id: { in: failed.map((f) => f.id) }, state: 'failed' }, data: { state: 'queued', failure: Prisma.DbNull, updatedAt: new Date() } });
      await tx.payrollRun.update({ where: { id: run.id }, data: { status: 'calculating', version: { increment: 1 } } });
      await audit(tx, c, 'payroll.run.retry_failed', 'payroll_run', run.id, { calcVersion: run.calcVersion, people: failed.length, employeeIds: failed.map((f) => f.employeeId) });
      return { org, runId: run.id, version: run.calcVersion, ids: failed.map((f) => f.employmentId) };
    }, RUN_TX);
    // Job ids must differ from the first calculation's (BullMQ keeps finished ids and skips a repeat) and keep three ":" parts (BullMQ refuses more).
    const tag = Date.now();
    for (let i = 0; i < out.ids.length; i += CHUNK) await this.queue.add('calc', { org: out.org, runId: out.runId, version: out.version, ids: out.ids.slice(i, i + CHUNK) }, { jobId: `${out.runId}:${out.version}r${tag}:${i / CHUNK}`, removeOnComplete: 1000, removeOnFail: 1000 });
    return { runId: out.runId, calcVersion: out.version, queued: out.ids.length };
  }

  /**
   * HLP-12 answers 92 and 93: the run's special days per person with their source (filled from injury leave, or payroll's
   * own), editable by payroll (payroll.input.manage) while the run may still be calculated and its month is not locked;
   * and injury leave approved after an earlier month was locked, shown here for payroll to review (never applied).
   */
  async specialDays(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const run = await this.runIn(tx, c, v, id, VIEW);
      if (run.runType !== 'regular') return { editable: false, rows: [], corrections: [], notPaid: [] };
      const period = await tx.payPeriod.findFirst({ where: { organizationId: org, legalEntityId: run.legalEntityId, payGroupId: null, periodStart: run.periodStart } });
      const open = ['draft', 'calculated', 'in_review', 'reopened'].includes(run.status) && !(period && (period.stage === 'locked' || period.stage === 'filed'));
      const editable = open && v.grants.has('payroll.input.manage');
      const rows = await tx.specialDays.findMany({ where: { organizationId: org, legalEntityId: run.legalEntityId, periodStart: run.periodStart, days: { gt: 0 } }, orderBy: [{ kind: 'asc' }, { enteredAt: 'asc' }] });
      const all = await tx.payCorrection.findMany({ where: { organizationId: org, legalEntityId: run.legalEntityId, source: { in: LISTED_SOURCES }, targetPeriod: run.periodStart, status: { in: ['approved', 'not_paid'] } }, orderBy: { createdAt: 'asc' } });
      // An injury correction carries its month and days; an attendance one its day (half a day for "half_day").
      const monthOfX = (x: (typeof all)[number]) => (x.change as { month?: string }).month ?? monthOf(x.workOn);
      const daysOfX = (x: (typeof all)[number]) => (x.change as { injuryDays?: string }).injuryDays ?? ((x.change as { shouldBe?: string }).shouldBe === 'half_day' ? '0.50' : '1.00');
      const corrections = all.filter((x) => x.status === 'approved');
      const dropped = all.filter((x) => x.status === 'not_paid');
      const people = await tx.employee.findMany({ where: { organizationId: org, id: { in: [...rows.map((r) => r.employeeId), ...all.map((x) => x.employeeId)] } }, select: { id: true, givenName: true, familyName: true, preferredName: true } });
      const who = await tx.user.findMany({ where: { organizationId: org, id: { in: dropped.map((x) => x.notPaidBy!) } }, select: { id: true, name: true, email: true } });
      const name = (eid: string) => {
        const e = people.find((p) => p.id === eid);
        return e ? (e.preferredName ?? [e.givenName, e.familyName].filter(Boolean).join(' ')) : 'Former employee';
      };
      return {
        editable,
        rows: rows.map((r) => ({ employeeId: r.employeeId, name: name(r.employeeId), kind: r.kind as 'suspension' | 'maternity' | 'injury', days: r.days.toFixed(2), source: r.source as 'leave' | 'payroll', note: r.note })),
        corrections: corrections.map((x) => ({ id: x.id, employeeId: x.employeeId, name: name(x.employeeId), month: monthOfX(x), days: daysOfX(x), note: x.reason, kind: x.source === 'injury_leave' ? ('injury' as const) : ('attendance' as const), on: x.source === 'injury_leave' ? null : dateOf(x.workOn) })),
        notPaid: dropped.map((x) => ({ id: x.id, name: name(x.employeeId), month: monthOfX(x), days: daysOfX(x), reason: x.notPaidReason!, by: who.find((u) => u.id === x.notPaidBy)?.name ?? who.find((u) => u.id === x.notPaidBy)?.email ?? 'Former user' })),
      };
    });
  }

  /**
   * HLP-12 answer 121: a late injury correction on this run is "Not paid" (reason kept, audited); it leaves the run and the
   * fill never raises it again. Undo puts it back to review. Both only while the run is open (payroll.input.manage).
   */
  async correctionNotPaid(ctx: TenantContext, user: ScopeUser, id: string, correctionId: string, reason: string | null) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const run = await this.runIn(tx, c, v, id, ['payroll.run.prepare']);
      if (!(await entitiesFor(tx, c, v, 'payroll.input.manage')).includes(run.legalEntityId)) throw new ForbiddenException('Only payroll with the inputs key for this legal entity can do that.');
      const period = await tx.payPeriod.findFirst({ where: { organizationId: org, legalEntityId: run.legalEntityId, payGroupId: null, periodStart: run.periodStart } });
      if (run.runType !== 'regular' || !['draft', 'calculated', 'in_review', 'reopened'].includes(run.status) || (period && (period.stage === 'locked' || period.stage === 'filed'))) throw new ConflictException('This run is locked: nothing on it changes now.');
      const x = await tx.payCorrection.findFirst({ where: { organizationId: org, id: correctionId, legalEntityId: run.legalEntityId, source: { in: LISTED_SOURCES }, targetPeriod: run.periodStart } });
      if (!x) throw new NotFoundException('Not found');
      if (reason !== null) {
        if (x.status !== 'approved') throw new ConflictException('This one is already marked not paid.');
        await tx.payCorrection.update({ where: { id: x.id }, data: { status: 'not_paid', notPaidReason: reason, notPaidBy: v.userId!, notPaidAt: new Date() } });
        await audit(tx, c, 'payroll.correction.not_paid', 'pay_correction', x.id, { runId: run.id, employeeId: x.employeeId, reason });
      } else {
        if (x.status !== 'not_paid') throw new ConflictException('This one is not marked not paid.');
        await tx.payCorrection.update({ where: { id: x.id }, data: { status: 'approved', notPaidReason: null, notPaidBy: null, notPaidAt: null } });
        await audit(tx, c, 'payroll.correction.not_paid_undone', 'pay_correction', x.id, { runId: run.id, employeeId: x.employeeId, was: x.notPaidReason });
      }
      return { id: x.id, status: reason !== null ? 'not_paid' : 'approved' };
    });
  }

  /** PAY-03 "Inputs": what feeds the run, per source, for its month and people (the same reads as the calculation). */
  async inputSources(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const run = await this.runIn(tx, c, v, id, VIEW);
      const members = await this.members(tx, org, run);
      const ids = members.map((m) => m.employmentId);
      const people = <T extends { employmentId: string }>(rows: T[]) => new Set(rows.map((r) => r.employmentId)).size;
      const sum = <T>(rows: T[], f: (r: T) => Prisma.Decimal) => rows.reduce((t, r) => t.add(f(r)), D(0)).toFixed(2);
      const regular = run.runType === 'regular';
      const period = regular ? await tx.payPeriod.findFirst({ where: { organizationId: org, legalEntityId: run.legalEntityId, payGroupId: null, periodStart: run.periodStart } }) : null;
      const feed = period ? await tx.payrollFeedRow.findMany({ where: { organizationId: org, payPeriodId: period.id, employeeId: { in: members.map((m) => m.employeeId) }, supersededAt: null } }) : [];
      const lop = regular ? await tx.lopInput.findMany({ where: { organizationId: org, employmentId: { in: ids }, periodStart: run.rangeStart ?? run.periodStart } }) : [];
      const oneTime = await tx.oneTimePay.findMany({
        where: regular ? { organizationId: org, employmentId: { in: ids }, status: 'approved', runId: null, holdReason: null, OR: [{ periodStart: run.periodStart, endOn: null }, { periodStart: { lte: run.periodStart }, endOn: { gte: run.periodStart } }] } : { organizationId: org, employmentId: { in: ids }, status: 'approved', runId: run.id, holdReason: null },
      });
      const holds = await tx.payrollWithhold.findMany({ where: { organizationId: org, employmentId: { in: ids }, releasedAt: null } });
      const loans = regular ? await tx.loan.findMany({ where: { organizationId: org, employmentId: { in: ids }, status: 'active', firstMonth: { lte: run.periodStart }, outstanding: { gt: 0 }, OR: [{ pausedUntil: null }, { pausedUntil: { lt: run.periodStart } }] } }) : [];
      const courts = regular ? await tx.courtOrder.findMany({ where: { organizationId: org, employmentId: { in: ids }, status: 'active', priorityDate: { lte: run.periodEnd }, OR: [{ endOn: null }, { endOn: { gte: run.periodStart } }] } }) : [];
      const overpaid = regular ? await tx.overpaymentRecovery.findMany({ where: { organizationId: org, employmentId: { in: ids }, status: 'active' } }) : [];
      const carries = regular ? await tx.payCarryForward.findMany({ where: { organizationId: org, employmentId: { in: ids }, status: 'open' } }) : [];
      const feedPeople = new Set(feed.map((r) => r.employeeId)).size;
      return {
        runId: run.id,
        people: members.length,
        sources: [
          ...(regular ? [{ key: 'attendance', label: 'Attendance from Time', people: feedPeople, days: feed.reduce((t, r) => t.add(r.lopDays), D(0)).toFixed(2), amount: null, note: period ? (feed.length ? null : 'Copied when the run is calculated') : 'The month is not frozen yet' }] : []),
          ...(regular ? [{ key: 'lop', label: 'Loss of pay entered by payroll', people: people(lop), days: sum(lop, (r) => r.lopDays), amount: null, note: null }] : []),
          { key: 'one_time', label: 'One-time pay', people: people(oneTime), days: null, amount: sum(oneTime, (r) => r.amount), note: null },
          { key: 'holds', label: 'Salary holds', people: people(holds), days: null, amount: null, note: null },
          ...(regular ? [{ key: 'loans', label: 'Loan and advance instalments', people: people(loans), days: null, amount: sum(loans, (r) => (r.emi.gt(r.outstanding) ? r.outstanding : r.emi)), note: null }] : []),
          ...(regular ? [{ key: 'court_orders', label: 'Court orders', people: people(courts), days: null, amount: null, note: null }] : []),
          ...(regular ? [{ key: 'overpayments', label: 'Overpayment recoveries', people: people(overpaid), days: null, amount: sum(overpaid, (r) => r.instalment), note: null }] : []),
          ...(regular ? [{ key: 'carry_forwards', label: 'Carried from last month (negative net)', people: people(carries), days: null, amount: null, note: null }] : []),
        ],
      };
    });
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
          await tx.payslipLine.createMany({ data: result.lines.map((l, i) => ({ organizationId: job.org, legalEntityId: r.legalEntityId, employeeId: re.employeeId, payslipId: slip.id, position: i, componentCode: l.code, name: l.name.slice(0, 80), kind: l.kind, segmentNo: l.segmentNo, amount: l.amount, quantity: l.quantity ?? null, rate: l.rate ?? null, explanation: l.explanation.slice(0, 1000), rule: l.rule ? (l.rule as unknown as Prisma.InputJsonValue) : Prisma.DbNull, verify: !!l.verify, sourceRef: l.sourceRef ?? null, separate: !!l.separate })) });
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
  async snapshot(tx: Tx, c: CompanyContext, run: Run, employmentId: string, rules: RuleSet[], reads = new ChunkReads([employmentId]), late = true): Promise<Snapshot> {
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
    // Founder 30 Oct 2026 (item 29): a leaver's statutory bonus is paid in the off-cycle bonus run. With no salary or job
    // this month their last ones stand in; only the bonus line is worked out (an items-only run pays no salary).
    const lastOnly = itemsOnly && run.offcycleKind === 'bonus' && (await reads.once(`bonusOnly:${run.id}`, () => this.bonusOnly(tx, org, run))).has(employmentId);
    if (start > end && !lastOnly) throw new NotReady('employment', 'Not employed in this pay period.');
    const group = await reads.once('group', () => tx.payGroup.findFirstOrThrow({ where: { organizationId: org, id: run.payGroupId } }));
    const inRange = <T extends { validFrom: Date; validTo: Date | null }>(rows: T[]) => rows.filter((x) => dateOf(x.validFrom) <= end && (!x.validTo || dateOf(x.validTo) >= start));
    const allComps = await reads.once('compensations', () => tx.compensation.findMany({ where: { organizationId: org, employmentId: { in: ids }, supersededAt: null, ...overlaps }, orderBy: { validFrom: 'asc' } }));
    let comps = inRange(mine(allComps));
    let assigns = inRange(mine(await reads.once('assignments', () => tx.employeeAssignment.findMany({ where: { organizationId: org, employmentId: { in: ids }, supersededAt: null, ...overlaps }, orderBy: { validFrom: 'asc' } }))));
    const standIn = lastOnly && (start > end || !comps.length || !assigns.length);
    if (standIn) {
      const lastComp = await tx.compensation.findFirst({ where: { organizationId: org, employmentId, supersededAt: null, validFrom: { lte: asDate(to) } }, orderBy: { validFrom: 'desc' } });
      const lastAsg = await tx.employeeAssignment.findFirst({ where: { organizationId: org, employmentId, supersededAt: null, validFrom: { lte: asDate(to) } }, orderBy: { validFrom: 'desc' } });
      comps = lastComp ? [lastComp] : [];
      assigns = lastAsg ? [lastAsg] : [];
    }
    const allComponents = await reads.once('components', () => tx.payComponent.findMany({ where: { organizationId: org } }));
    let packages = await reads.once('packages', () => tx.compensationPackage.findMany({ where: { organizationId: org, changeId: { in: allComps.map((x) => x.changeId) } } }));
    let packageLines = await reads.once('packageLines', () => tx.compensationLine.findMany({ where: { organizationId: org, packageId: { in: packages.map((x) => x.id) } } }));
    const locations = await reads.once('locations', () => tx.location.findMany({ where: { organizationId: org }, select: { id: true, state: true, minWageZone: true } }));
    if (!comps.length) throw new NotReady('compensation', standIn ? 'No salary was ever recorded for this leaver. Pay their bonus through the F&F settlement.' : 'No salary for this month.');
    if (!assigns.length) throw new NotReady('assignment', 'No job details for this month.');
    if (standIn) {
      const pkg = await tx.compensationPackage.findFirst({ where: { organizationId: org, changeId: comps[0].changeId } });
      // Copies: the chunk's shared reads stay as read.
      if (pkg && !packages.some((x) => x.id === pkg.id)) {
        packages = [...packages, pkg];
        packageLines = [...packageLines, ...(await tx.compensationLine.findMany({ where: { organizationId: org, packageId: pkg.id } }))];
      }
    }
    // A stand-in salary and job cover the whole month (one segment; the items-only run pays no salary from it).
    const cuts = standIn ? [from] : [...new Set([start, ...comps.map((x) => dateOf(x.validFrom)), ...assigns.map((x) => dateOf(x.validFrom))].filter((d) => d >= start && d <= end))].sort();
    const covering = <T extends { validFrom: Date; validTo: Date | null }>(rows: T[], d: string) => rows.find((x) => dateOf(x.validFrom) <= d && (!x.validTo || dateOf(x.validTo) >= d));
    const segments: Segment[] = [];
    for (let i = 0; i < cuts.length; i++) {
      const sFrom = cuts[i];
      const sTo = standIn ? to : i + 1 < cuts.length ? addDays(cuts[i + 1], -1) : end;
      const comp = standIn ? comps[0] : covering(comps, sFrom);
      const asg = standIn ? assigns[0] : covering(assigns, sFrom);
      if (!comp || !asg) throw new NotReady('compensation', `No salary or job details on ${sFrom}.`);
      const pkg = packages.find((x) => x.changeId === comp.changeId);
      if (!pkg) throw new NotReady('compensation', `The salary from ${dateOf(comp.validFrom)} has no breakup. Revise it in Payroll › Compensation.`);
      const pl = packageLines.filter((l) => l.packageId === pkg.id);
      const codes = new Map(allComponents.map((x) => [x.id, x.code]));
      const loc = locations.find((x) => x.id === asg.locationId);
      if (!loc) throw new NotReady('assignment', 'The job has no work location.');
      segments.push({ from: sFrom, to: sTo, days: Number(sTo.slice(8)) - Number(sFrom.slice(8)) + 1, lines: pl.map((l) => ({ code: codes.get(l.componentId)!, monthly: l.monthly.toFixed(2) })), payBasis: pkg.payBasis as Segment['payBasis'], rate: pkg.rate?.toFixed(2) ?? null, otMultiplier: pkg.otMultiplier?.toFixed(2) ?? null, holidayMultiplier: pkg.holidayMultiplier?.toFixed(2) ?? null, state: loc.state, zone: loc.minWageZone, skill: asg.skillClass ?? null, changeId: comp.changeId });
    }
    const components: CalcComponent[] = allComponents.map((x) => ({ code: x.code, name: x.name, kind: x.kind as CalcComponent['kind'], pfWage: x.pfWage, pfBelowCeiling: x.pfBelowCeiling, esiWage: x.esiWage, ptWage: x.ptWage, gratuityWage: x.gratuityWage, bonusWage: x.bonusWage, codeWagePart: x.codeWagePart, codeExclusion: x.codeExclusion, prorated: x.prorated, rounding: x.rounding as CalcComponent['rounding'], statutory: x.statutory, taxable: x.taxable }));
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
    // E3 review item 8: arrears from a worksheet (not a correction) already carry their statutory differences.
    const sheetRefs = oneTime.filter((o) => o.source === 'arrears' && /^[0-9a-f-]{36}$/i.test(o.sourceRef ?? '')).map((o) => o.sourceRef!);
    const sheets = new Set(sheetRefs.length ? (await tx.arrearsWorksheet.findMany({ where: { organizationId: org, id: { in: sheetRefs } }, select: { id: true } })).map((x) => x.id) : []);
    const special = itemsOnly || !monthly ? [] : mine(await reads.once('special', () => tx.specialDays.findMany({ where: { organizationId: org, employmentId: { in: ids }, periodStart: run.periodStart } })));
    const recent = await tx.payslip.findMany({ where: { organizationId: org, employmentId, status: 'approved', runType: 'regular', periodStart: { lt: run.periodStart } }, orderBy: { periodStart: 'desc' }, take: 3 });
    const recentDays = recent.reduce((t, x) => t + Number(monthRange(dateOf(x.periodStart).slice(0, 7)).to.slice(8)), 0);
    const courts = itemsOnly || !monthly ? [] : mine(await reads.once('courts', () => tx.courtOrder.findMany({ where: { organizationId: org, employmentId: { in: ids }, status: 'active', priorityDate: { lte: asDate(to) }, OR: [{ endOn: null }, { endOn: { gte: asDate(from) } }] } }))).filter((o) => dateOf(o.priorityDate) <= end && (!o.endOn || dateOf(o.endOn) >= start));
    const loans = itemsOnly || !monthly ? [] : mine(await reads.once('loans', () => tx.loan.findMany({ where: { organizationId: org, employmentId: { in: ids }, status: 'active', firstMonth: { lte: run.periodStart }, outstanding: { gt: 0 }, OR: [{ pausedUntil: null }, { pausedUntil: { lt: run.periodStart } }] }, orderBy: { firstMonth: 'asc' } })));
    // D14: every disbursed loan or advance still owed (paused ones too) for the loan perquisite; an expense advance is not a loan.
    // shortcut: the balance before this month's instalment is the month's maximum; a re-run of an approved month reads the balance after it.
    const perqLoans = itemsOnly || !monthly ? [] : mine(await reads.once('perqLoans', () => tx.loan.findMany({ where: { organizationId: org, employmentId: { in: ids }, status: { in: ['active', 'paused'] }, loanType: { in: ['loan', 'advance'] }, outstanding: { gt: 0 } }, orderBy: { firstMonth: 'asc' } })));
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
      joinedOn: dateOf(em.joinedOn),
      ytd: { pt: (ytdPt._sum.amount ?? D(0)).toFixed(2), ...(await this.ptWageSoFar(tx, org, employmentId, run.periodStart, fyStart, month, components)) },
      oneTime: [
        ...oneTime.map((o) => ({ id: o.id, code: o.componentCode, amount: o.amount.toFixed(2), days: o.endOn && dateOf(o.endOn) <= to && dateOf(o.periodStart) < from ? Number(dateOf(o.endOn).slice(8)) : null, ...(o.label ? { label: o.label } : {}), ...(o.paidSeparately ? { separate: true } : {}), ...(o.grossUp ? { grossUp: true } : {}), ...(o.sourceRef && sheets.has(o.sourceRef) ? { settled: true } : {}) })),
        // Late corrections approved after their month locked, paid in this regular run (PAY-1.03 / 1.04).
        // An F&F run paying the leaver's last salary pays them too (no regular run follows for that person).
        // Answer 2283: the F&F run pays it even when the last month's regular payslip was already approved (items only).
        ...(late && (run.runType === 'regular' ? monthly && !itemsOnly : run.offcycleKind === 'fnf') ? await this.lateCorrectionItems(tx, c, run, em, rules, allComponents) : []),
      ],
      // HLP-12 answer 65: a row filled from leave may be 0 days (the leave was cancelled); inFeed: already unpaid in the feed.
      special: special.filter((x) => x.days.gt(0)).map((x) => ({ kind: x.kind as 'suspension' | 'maternity' | 'injury', days: x.days.toFixed(2), daysBefore: x.daysBefore, inFeedDays: x.inFeedDays.toFixed(2) })),
      averageDailyWage: recentDays ? recent.reduce((t, x) => t.add(x.gross), D(0)).div(recentDays).toFixed(2) : null,
      recoveries: {
        courtOrders: courts.map((o) => ({ id: o.id, ref: o.orderRef, amount: o.amount?.toFixed(2) ?? null, percent: o.percent?.toFixed(2) ?? null, priorityDate: dateOf(o.priorityDate), remaining: o.capTotal ? o.capTotal.sub(o.remittedTotal).toFixed(2) : null })),
        // The leaver's last pay recovers the whole loan balance and whatever is left of an agreed overpayment.
        loans: loans.map((l) => ({ id: l.id, emi: (offcycle === 'fnf' ? l.outstanding : l.emi).toFixed(2), outstanding: l.outstanding.toFixed(2) })),
        carryForwards: carries.map((x) => ({ id: x.id, balance: x.amount.sub(x.recovered).toFixed(2) })),
        ...(overpaid.length ? { overpayments: overpaid.map((x) => { const left = x.amount.sub(x.recovered).sub(x.writtenOff); return { id: x.id, instalment: (offcycle === 'fnf' ? left : x.instalment).toFixed(2), balance: left.toFixed(2) }; }) } : {}),
      },
      ...(perqLoans.length ? { perqLoans: perqLoans.map((l) => ({ id: l.id, purpose: l.perqPurpose, ratePct: l.interestRate.toFixed(2), maxOutstanding: l.outstanding.toFixed(2), exempt: l.perqExempt })) } : {}),
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

  /**
   * PAY-1.03 / 1.04, YX-LOCK-03: the approved corrections of this person whose month was locked, targeted at this run's
   * month. Each locked month is worked out again by the same engine with the day as it should have been (its own
   * corrections never re-applied), and the difference per earning component is paid here under the same component, so
   * PF, ESI, PT and tax follow its flags; less pay (a recovery) is a negative line. "Not paid" ones are left out.
   */
  private async lateCorrectionItems(tx: Tx, c: CompanyContext, run: Run, em: { id: string; employeeId: string; legalEntityId: string }, rules: RuleSet[], components: { code: string; statutory: string | null }[]): Promise<Snapshot['oneTime']> {
    const org = c.organizationId;
    const list = await paidCorrections(tx, org, run.legalEntityId, em.employeeId, run.periodStart);
    if (!list.length) return [];
    const out: Snapshot['oneTime'] = [];
    for (const x of list) out.push(...(await this.correctionItems(tx, c, run, em, rules, components, x)));
    return out;
  }

  /** One correction's pay, per earning component: the locked month worked out again with the day as it should have been. */
  private async correctionItems(tx: Tx, c: CompanyContext, run: Run, em: { id: string; employeeId: string }, rules: RuleSet[], components: { code: string; statutory: string | null }[], x: { id: string; workOn: Date; decidedAt: Date | null; source: string; change: Prisma.JsonValue }): Promise<Snapshot['oneTime']> {
    const org = c.organizationId;
    const statutory = new Set(components.filter((k) => k.statutory).map((k) => k.code));
    const types = await tx.leaveType.findMany({ where: { organizationId: org }, select: { name: true, code: true, paid: true } });
    const on = dateOf(x.workOn);
    const delta = shouldBeLop(x, types) - (await wasLop(tx, org, em.employeeId, on));
    if (!delta) return [];
    const locked = await this.snapshot(tx, c, await monthRun(tx, org, { id: em.id, legalEntityId: run.legalEntityId }, on.slice(0, 7), run.preparedBy), em.id, rules, undefined, false);
    const diff = componentDifference(calculatePayslip(locked, rules).lines, calculatePayslip(withDayChanged(locked, delta), rules).lines, statutory);
    const label = correctionLabel(on, delta, x.decidedAt ? dateOf(x.decidedAt) : null);
    return [...diff].map(([code, amount]) => ({ id: x.id, code, amount: amount.toFixed(2), days: null, label }));
  }

  /**
   * Answer 2300: a late correction of someone whose full and final settlement was settled before it was approved is paid
   * in an off-cycle correction run of the month of their last day (open, or made now for their pay group), as one-time
   * pay under the same components (so PF, ESI and tax follow). Once; never if a payslip already paid it.
   */
  async correctionToOffcycle(ctx: TenantContext, user: ScopeUser, correctionId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const x = await tx.payCorrection.findFirst({ where: { organizationId: org, id: correctionId, status: 'approved', source: { in: PAID_SOURCES } } });
      if (!x) throw new NotFoundException('Not found');
      await requireEntity(tx, c, v, 'payroll.offcycle.prepare', x.legalEntityId);
      await payScope(tx, [x.legalEntityId]);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`correction:${x.id}`}))`;
      const f = await tx.fnfSettlement.findFirst({ where: { organizationId: org, employeeId: x.employeeId, legalEntityId: x.legalEntityId }, orderBy: { createdAt: 'desc' } });
      if (!f || f.status !== 'settled') throw new ConflictException('Their full and final settlement is not settled yet: it pays this correction.');
      if (await tx.oneTimePay.findFirst({ where: { organizationId: org, source: 'arrears', sourceRef: x.id, status: 'approved' }, select: { id: true } })) throw new ConflictException('This correction is already in an off-cycle run.');
      if (await correctionPaid(tx, org, x.id)) throw new ConflictException('A payslip already paid this correction.');
      const month = dateOf(f.lwd).slice(0, 7);
      const { from, to } = monthRange(month);
      const member = await tx.payGroupMember.findFirst({ where: { organizationId: org, employmentId: f.employmentId, validFrom: { lte: asDate(to) } }, orderBy: { validFrom: 'desc' } });
      const group = member ? { id: member.payGroupId } : await tx.payGroup.findFirst({ where: { organizationId: org, legalEntityId: x.legalEntityId, status: 'active' }, orderBy: { createdAt: 'asc' } });
      if (!group) throw new ConflictException('The person is in no pay group.');
      let run = await tx.payrollRun.findFirst({ where: { organizationId: org, legalEntityId: x.legalEntityId, payGroupId: group.id, runType: 'offcycle', offcycleKind: 'correction', periodStart: asDate(from), status: { in: ['draft', 'calculated', 'in_review', 'reopened'] } }, orderBy: { createdAt: 'desc' } });
      if (!run) {
        run = await tx.payrollRun.create({ data: { organizationId: org, legalEntityId: x.legalEntityId, payGroupId: group.id, periodStart: asDate(from), periodEnd: asDate(to), preparedBy: v.userId!, runType: 'offcycle', offcycleKind: 'correction' } });
        await audit(tx, c, 'payroll.run.created', 'payroll_run', run.id, { payGroupId: group.id, month, offcycle: 'correction', for: 'late_correction' });
      }
      const components = await tx.payComponent.findMany({ where: { organizationId: org }, select: { code: true, statutory: true } });
      const items = await this.correctionItems(tx, c, run, { id: f.employmentId, employeeId: x.employeeId }, await this.rules.published(), components, x);
      if (!items.length) throw new ConflictException('This correction changes no pay.');
      for (const it of items)
        await tx.oneTimePay.create({ data: { organizationId: org, legalEntityId: x.legalEntityId, employeeId: x.employeeId, employmentId: f.employmentId, componentCode: it.code, amount: it.amount, periodStart: run.periodStart, source: 'arrears', sourceRef: x.id, reason: x.reason.slice(0, 300), label: it.label ?? null, status: 'approved', runId: run.id, createdBy: v.userId! } });
      await audit(tx, c, 'payroll.correction.to_offcycle', 'pay_correction', x.id, { runId: run.id, items: items.length, employeeId: x.employeeId });
      return { runId: run.id, items: items.length };
    }, RUN_TX);
  }

  /** Earlier sub-periods of the month (approved): taxable pay, PT wage, basic, HRA and PT, for the run that ends the month. */
  /** Review M5 / M6: the PT wage of this financial year's and this half-year's approved payslips before this month. */
  private async ptWageSoFar(tx: Tx, org: string, employmentId: string, periodStart: Date, fyStart: string, month: string, components: CalcComponent[]) {
    const codes = components.filter((x) => x.kind === 'earning' && x.ptWage).map((x) => x.code);
    const slips = await tx.payslip.findMany({ where: { organizationId: org, employmentId, status: 'approved', periodStart: { gte: asDate(fyStart), lt: periodStart } }, select: { id: true, periodStart: true } });
    const lines = slips.length && codes.length ? await tx.payslipLine.findMany({ where: { organizationId: org, payslipId: { in: slips.map((x) => x.id) }, componentCode: { in: codes } }, select: { payslipId: true, amount: true } }) : [];
    const m = Number(month.slice(5, 7));
    const halfStart = m >= 4 && m <= 9 ? fyStart : `${fyStart.slice(0, 4)}-10-01`;
    const inHalf = new Set(slips.filter((x) => dateOf(x.periodStart) >= halfStart).map((x) => x.id));
    const sum = (pick: (l: { payslipId: string }) => boolean) => lines.filter(pick).reduce((t, l) => t.add(l.amount), D(0)).toFixed(2);
    return { ptWage: sum(() => true), halfPtWage: sum((l) => inHalf.has(l.payslipId)) };
  }

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
      const ifsc = await waitingForIfsc(tx, c.organizationId, slips);
      // PAY-10: "waiting for corrected IFSC" is a failed payment the bank cannot be sent again yet.
      return slips.map((s) => ({ ...this.slipView(s), waitingFor: ifsc.has(s.id) ? ('ifsc' as const) : null }));
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
      return { ...this.slipView(s), days: await this.dayStrip(tx, c.organizationId, s), ruleVersions: s.ruleVersions, lines: lines.map((l) => ({ code: l.componentCode, name: l.name, kind: l.kind, segmentNo: l.segmentNo, amount: l.amount.toFixed(2), quantity: l.quantity?.toFixed(2) ?? null, rate: l.rate?.toFixed(4) ?? null, explanation: l.explanation, rule: l.rule, verify: l.verify, ...(l.separate ? { separate: true } : {}) })) };
    });
  }

  /**
   * Founder answer 6 (PAY-21): a regular monthly payslip's days, from the attendance days and approved leave the payroll
   * feed counts payable days from, with the feed's frozen totals. Null for off-cycle and weekly payslips.
   */
  private async dayStrip(tx: Tx, org: string, s: Prisma.PayslipGetPayload<object>) {
    if (s.runType !== 'regular' || s.subPeriod !== 0) return null;
    const month = dateOf(s.periodStart).slice(0, 7);
    const { from, to } = monthRange(month);
    const e = await tx.employment.findFirst({ where: { organizationId: org, id: s.employmentId }, select: { joinedOn: true, exitedOn: true } });
    if (!e) return null;
    const rows = await tx.attendanceDay.findMany({ where: { organizationId: org, employeeId: s.employeeId, workOn: { gte: asDate(from), lte: asDate(to) } }, select: { workOn: true, status: true, leavePart: true } });
    const leave = await tx.$queryRaw<{ on: string; paid: boolean }[]>`
      SELECT d.leave_on::text AS on, bool_and(t.paid) AS paid FROM leave_request_days d
      JOIN leave_requests r ON r.organization_id = d.organization_id AND r.id = d.request_id AND r.status IN ('approved', 'cancel_pending')
      JOIN leave_types t ON t.organization_id = r.organization_id AND t.id = r.leave_type_id
      WHERE d.organization_id = ${org}::uuid AND d.employee_id = ${s.employeeId}::uuid AND d.active AND d.portion > 0 AND d.leave_on BETWEEN ${from}::date AND ${to}::date
      GROUP BY 1`;
    const feed = await tx.payrollFeedRow.findFirst({ where: { organizationId: org, employeeId: s.employeeId, periodStart: s.periodStart, supersededAt: null }, select: { calendarDays: true, paidDays: true, lopDays: true } });
    return {
      list: dayKinds({
        from,
        to,
        joinedOn: dateOf(e.joinedOn),
        exitedOn: e.exitedOn ? dateOf(e.exitedOn) : null,
        today: todayIst(),
        rows: new Map(rows.map((r) => [dateOf(r.workOn), { status: r.status, leavePart: r.leavePart }])),
        leavePaid: new Map(leave.map((l) => [l.on, l.paid])),
      }),
      calendarDays: feed?.calendarDays ?? null,
      paidDays: feed?.paidDays.toFixed(2) ?? null,
      lopDays: feed?.lopDays.toFixed(2) ?? null,
    };
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
      for (const r of await tx.specialDays.findMany({ where: { organizationId: org, periodStart: run.periodStart, employeeId: { in: people } }, select: { enteredBy: true } })) if (r.enteredBy) makers.add(r.enteredBy);
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
      await this.loanPerquisites(tx, org, s, result.lines, now);
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
        // PPL-22: the F&F statement letter goes to the person's documents (FnfService issues it).
        await tx.eventOutbox.create({ data: { organizationId: org, eventType: 'payroll.fnf.run_approved', payload: { fnfSettlementId: f.id, runId: run.id } } });
      }
    // Modules that follow approved pay (HIR-12 answer 231: the referral bonus cost) hear it after the commit.
    await tx.eventOutbox.create({ data: { organizationId: org, eventType: 'payroll.run.approved', payload: { runId: run.id } } });
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
  /**
   * D14 (answer 2405): an approved payslip's loan perquisite lines go to the year's perquisites (Form 12BA / Form No. 123),
   * one row per loan and month; a revised payslip replaces the month's rows (dropped loans are cancelled).
   */
  private async loanPerquisites(tx: Tx, org: string, s: { employeeId: string; employmentId: string; legalEntityId: string; periodStart: Date }, lines: { code: string; amount: string; explanation: string; sourceRef?: string }[], now: Date) {
    const month = dateOf(s.periodStart).slice(0, 7);
    const perq = lines.filter((l) => l.code === 'loan_perquisite' && l.sourceRef && D(l.amount).gt(0));
    const refs = perq.map((l) => `loan:${l.sourceRef}:${month}`);
    await tx.perquisite.updateMany({ where: { organizationId: org, employeeId: s.employeeId, kind: 'loan', periodStart: s.periodStart, cancelledAt: null, sourceRef: { notIn: refs } }, data: { cancelledAt: now } });
    for (const [i, l] of perq.entries()) {
      const data = { annualValue: D(l.amount), description: `${month}: ${l.explanation}`.slice(0, 300), cancelledAt: null };
      const old = await tx.perquisite.findFirst({ where: { organizationId: org, sourceRef: refs[i] } });
      if (old) await tx.perquisite.update({ where: { id: old.id }, data });
      else await tx.perquisite.create({ data: { ...data, organizationId: org, legalEntityId: s.legalEntityId, employeeId: s.employeeId, employmentId: s.employmentId, taxYear: taxYearOf(month), kind: 'loan', enteredBy: SYSTEM_USER, sourceRef: refs[i], periodStart: s.periodStart } });
    }
  }

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

/**
 * A2: what the entity must have on record before a run is approved: its TAN and PAN, and a PT registration in every
 * state that charges PT where a member works at the period end (their statutory profile's PT state, else their place).
 */
export async function approvalGaps(tx: Tx, org: string, run: Pick<Run, 'legalEntityId' | 'periodEnd'>, members: { employmentId: string }[], rules: RuleSet[]): Promise<{ checkKey: string; message: string }[]> {
  const out: { checkKey: string; message: string }[] = [];
  const end = dateOf(run.periodEnd);
  const ent = await tx.legalEntity.findFirstOrThrow({ where: { organizationId: org, id: run.legalEntityId }, select: { tan: true, pan: true, country: true } });
  if (ent.country !== 'IN') return out; // India's deductor and PT rules only
  if (!ent.tan) out.push({ checkKey: 'entity_tan_missing', message: "The entity's TAN is not recorded (Payroll · Setup · Deductor details). Tax cannot be deposited without it." });
  if (!ent.pan) out.push({ checkKey: 'entity_pan_missing', message: "The entity's PAN is not recorded (Payroll · Setup · Deductor details)." });
  const employmentIds = members.map((m) => m.employmentId);
  if (!employmentIds.length) return out;
  const when = { validFrom: { lte: run.periodEnd }, OR: [{ validTo: null }, { validTo: { gte: run.periodEnd } }] };
  const profiles = await withPayScope(tx, [run.legalEntityId], () => tx.employeeStatutory.findMany({ where: { organizationId: org, employmentId: { in: employmentIds }, ...when }, select: { employmentId: true, ptState: true } }));
  const asgs = await tx.employeeAssignment.findMany({ where: { organizationId: org, employmentId: { in: employmentIds }, supersededAt: null, validFrom: { lte: run.periodEnd } }, orderBy: { validFrom: 'desc' }, select: { employmentId: true, locationId: true } });
  const locs = new Map((await tx.location.findMany({ where: { organizationId: org, id: { in: [...new Set(asgs.map((a) => a.locationId))] } }, select: { id: true, state: true } })).map((l) => [l.id, l.state]));
  const states = new Set<string>();
  for (const id of employmentIds) {
    const st = profiles.find((p) => p.employmentId === id)?.ptState ?? locs.get(asgs.find((a) => a.employmentId === id)?.locationId ?? '');
    if (st) states.add(st);
  }
  const regs = await tx.statutoryRegistration.findMany({ where: { organizationId: org, legalEntityId: run.legalEntityId, statute: 'IN.PT', status: { in: ['on', 'applied_awaited'] } }, select: { state: true } });
  for (const st of [...states].sort())
    if (ptCharged(rules, st, end) && !regs.some((r) => r.state === st)) out.push({ checkKey: `pt_registration_${st}`, message: `People in this run work in ${st}, which charges professional tax, but the entity's PT registration there is not recorded (Payroll · Setup · Registrations).` });
  return out;
}
