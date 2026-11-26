import { Inject, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { REDIS_CONNECTION, bullOpts, logBullErrors } from '../jobs/redis-connection';
import { AutomationService } from '../rules-engine/automation.service';
import { type CompanyContext, type Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { asDate, dateOf } from '../time/time-core';
import type { ScopeUser } from '../access/scope';
import { entitiesFor, payScope, payViewer, requireSelf } from './pay-access';
import { ArrearsService, type Trigger } from './arrears.service';

// Enterprise E3 (answers 2651, 2652, 2786, 2787; review items 3 and 6): back-dated pay that drafts itself, as BullMQ jobs.
//   change   a salary change approved with a date in a month already paid: one worksheet for the person, drafted by the
//            person who asked for the change (so they never approve their own arrears), the components whose "salary
//            change" switch is on;
//   join     an employment added with a joining date in a month already paid: the same, with the "joining date" switch;
//   rule     a statutory proposal: its preview (people, total, largest change) and, once a company user accepts it, the
//            drafts, in chunks of people.
// Each job is one arrears_runs row, unique on what fired it (the change, the employment, the proposal) and its mode, and
// each chunk has a fixed job id, so a retry or a second event never drafts twice. A trigger only drafts: payroll still
// checks and approves each worksheet (maker-checker). The company setting payroll.arrears.auto_draft turns triggers off.

const QUEUE = 'payroll-arrears';
export const CHUNK = 25;
type Kind = 'change' | 'join' | 'rule';
type Mode = 'preview' | 'draft';
export interface ArrearsItem {
  employmentId: string;
  from: string;
  to: string;
}
export interface ArrearsChunk {
  org: string;
  /** The legal entity of the run (the pay guard opens to it only). */
  entity: string;
  runId: string;
  items: ArrearsItem[];
}

@Injectable()
export class ArrearsJobs implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ArrearsJobs.name);
  private readonly queue: Queue<ArrearsChunk>;
  private worker: Worker<ArrearsChunk> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly arrears: ArrearsService,
    private readonly automation: AutomationService,
    @Inject(REDIS_CONNECTION) private readonly connection: Redis,
  ) {
    this.queue = logBullErrors(new Queue<ArrearsChunk>(QUEUE, bullOpts(connection)), QUEUE);
  }

  onModuleInit() {
    this.worker = logBullErrors(new Worker<ArrearsChunk>(QUEUE, (job) => this.runChunk(job.data), bullOpts(this.connection)), QUEUE);
    // After the HR change is saved (the outbox event is sent once its transaction commits).
    this.automation.subscribe(async (ev) => {
      const p = ev.payload;
      if (ev.type === 'employee.salary.retro' && typeof p.changeId === 'string' && typeof p.employmentId === 'string' && typeof p.from === 'string')
        await this.fromTrigger(ev.organizationId, 'change', p.changeId, p.employmentId, p.from, typeof p.by === 'string' ? p.by : null).catch((e: Error) => this.logger.error(`arrears for change ${p.changeId}: ${e.message}`));
      if (ev.type === 'employee.joined' && typeof p.employmentId === 'string' && typeof p.joinedOn === 'string')
        await this.fromTrigger(ev.organizationId, 'join', p.employmentId, p.employmentId, p.joinedOn, typeof p.by === 'string' ? p.by : null).catch((e: Error) => this.logger.error(`arrears for joiner ${p.employmentId}: ${e.message}`));
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue.close();
  }

  private sys(org: string): CompanyContext {
    return { organizationId: org, isSuperAdmin: false, userId: null, role: null, supportSessionId: null };
  }

  /** The last month of the entity whose regular payroll is approved or paid, on or after `from` (null: nothing paid yet). */
  private async lastPaid(tx: Tx, org: string, entity: string, from: string): Promise<string | null> {
    const r = await tx.payrollRun.findFirst({ where: { organizationId: org, legalEntityId: entity, runType: 'regular', status: { in: ['approved', 'paid'] }, periodStart: { gte: asDate(`${from.slice(0, 7)}-01`), lte: asDate(`${todayIst().slice(0, 7)}-01`) } }, orderBy: { periodStart: 'desc' }, select: { periodStart: true } });
    return r ? dateOf(r.periodStart).slice(0, 7) : null;
  }

  /** A salary change or joining date reached a paid month: one job for the person (once per change or employment). */
  async fromTrigger(org: string, kind: 'change' | 'join', ref: string, employmentId: string, from: string, by: string | null) {
    const c = this.sys(org);
    const start = await this.tenantPrisma.forTenant(c, async (tx) => {
      const em = await tx.employment.findFirst({ where: { organizationId: org, id: employmentId } });
      if (!em) return null;
      await payScope(tx, [em.legalEntityId]);
      if ((await settingFor(tx, c, 'payroll.arrears.auto_draft', { legalEntityId: em.legalEntityId })) !== 'on') return null;
      const to = await this.lastPaid(tx, org, em.legalEntityId, from);
      if (!to) return null;
      // Review item 3: the maker is the person whose change fired it (else who approved it).
      let maker = by;
      if (kind === 'change') {
        const ch = await tx.employeeChange.findFirst({ where: { organizationId: org, id: ref }, select: { requestedBy: true, decidedBy: true } });
        maker = ch?.requestedBy ?? ch?.decidedBy ?? by;
      }
      if (!maker) return null;
      return this.open(tx, org, em.legalEntityId, kind, ref, 'draft', maker, [{ employmentId, from: from.slice(0, 7), to }]);
    });
    if (start) await this.enqueue(org, start.entity, start.runId, start.items);
    return start?.runId ?? null;
  }

  /** The run row (unique on kind, ref and mode) and its chunks; an existing row is never started twice. */
  private async open(tx: Tx, org: string, entity: string, kind: Kind, ref: string, mode: Mode, by: string, items: ArrearsItem[]) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO arrears_runs (organization_id, legal_entity_id, kind, ref, mode, people, created_by)
      VALUES (${org}::uuid, ${entity}::uuid, ${kind}, ${ref}::uuid, ${mode}, ${items.length}, ${by}::uuid)
      ON CONFLICT (organization_id, kind, ref, mode) DO NOTHING RETURNING id::text`;
    if (!rows.length) {
      // Already started: only a run still waiting is queued again (its chunk ids are fixed, so BullMQ never runs one twice).
      const old = await tx.arrearsRun.findFirst({ where: { organizationId: org, kind, ref, mode }, select: { id: true, status: true } });
      return old?.status === 'queued' ? { runId: old.id, entity, items } : null;
    }
    await audit(tx, { ...this.sys(org), userId: by }, 'payroll.arrears.run_started', 'arrears_run', rows[0]!.id, { kind, ref, mode, people: items.length });
    return { runId: rows[0]!.id, entity, items };
  }

  private async enqueue(org: string, entity: string, runId: string, items: ArrearsItem[]) {
    if (!items.length) return this.finishIfDone(org, entity, runId);
    for (let i = 0; i < items.length; i += CHUNK) await this.queue.add('chunk', { org, entity, runId, items: items.slice(i, i + CHUNK) }, { jobId: `${runId}-${i / CHUNK}`, attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 1000, removeOnFail: 1000 });
  }

  /**
   * One chunk: each person in their own transaction (a failure is listed and the others go on). Drafts skip a person who
   * already has a worksheet from this source (a retried chunk), so nothing is drafted twice.
   */
  async runChunk(job: ArrearsChunk) {
    const c = this.sys(job.org);
    const run = await this.scoped(job.org, job.entity, (tx) => tx.arrearsRun.findFirst({ where: { organizationId: job.org, id: job.runId } }));
    if (!run || run.status === 'done' || run.status === 'failed') return;
    const trigger: Trigger | undefined = run.kind === 'change' ? 'salary' : run.kind === 'join' ? 'joining' : undefined;
    const source = run.kind === 'change' ? 'salary' : run.kind === 'join' ? 'joining' : 'rule';
    for (const it of job.items) {
      try {
        const out = await this.tenantPrisma.forTenant(
          c,
          async (tx) => {
            await payScope(tx, [run.legalEntityId]);
            await tx.$executeRaw`UPDATE arrears_runs SET status = 'running' WHERE id = ${run.id}::uuid AND status = 'queued'`;
            const em = await tx.employment.findFirst({ where: { organizationId: job.org, id: it.employmentId } });
            if (!em) return { skip: 'No longer employed here' };
            if (run.mode === 'preview') return { total: (await this.arrears.previewIn(tx, { ...c, userId: run.createdBy }, run.createdBy, em, it.from, it.to, trigger)).total, employeeId: em.employeeId };
            const done = await tx.arrearsWorksheet.findFirst({ where: { organizationId: job.org, employmentId: em.id, source, sourceRef: run.ref, status: { not: 'discarded' } }, select: { id: true } });
            if (done) return { skip: null };
            const reason = run.kind === 'change' ? 'A back-dated salary change reaches months already paid' : run.kind === 'join' ? 'A joining date reaches months already paid' : 'Statutory rules changed for months already paid';
            const w = await this.arrears.worksheetIn(tx, { ...c, userId: run.createdBy }, run.createdBy, em, it.from, it.to, source, run.ref, reason, trigger);
            return { total: w.total, employeeId: em.employeeId };
          },
          { timeout: 60_000 },
        );
        await this.record(job.org, job.entity, run.id, out);
      } catch (e) {
        const msg = (e as { response?: { message?: string } }).response?.message ?? (e as Error).message;
        await this.record(job.org, job.entity, run.id, { skip: String(msg).slice(0, 200), employmentId: it.employmentId });
      }
    }
    await this.finishIfDone(job.org, job.entity, run.id);
  }

  /** The job's own transaction, the pay guard open for the run's entity only. */
  private scoped<T>(org: string, entity: string, fn: (tx: Tx) => Promise<T>) {
    return this.tenantPrisma.forTenant(this.sys(org), async (tx) => {
      await payScope(tx, [entity]);
      return fn(tx);
    });
  }

  private async record(org: string, entity: string, runId: string, out: { total?: Prisma.Decimal; employeeId?: string; skip?: string | null; employmentId?: string }) {
    await this.scoped(org, entity, async (tx) => {
      if (out.total !== undefined) {
        const abs = out.total.abs();
        await tx.$executeRaw`UPDATE arrears_runs SET drafted = drafted + 1, total = total + ${out.total}::numeric,
          largest_employee_id = CASE WHEN ${abs}::numeric > largest THEN ${out.employeeId ?? null}::uuid ELSE largest_employee_id END,
          largest = GREATEST(largest, ${abs}::numeric) WHERE id = ${runId}::uuid`;
      } else {
        // A person already drafted (a retry) counts as done; one that could not be worked out is listed with why.
        const entry = out.skip ? [{ employmentId: out.employmentId ?? null, why: out.skip }] : [{ employmentId: out.employmentId ?? null, why: null }];
        await tx.$executeRaw`UPDATE arrears_runs SET skipped = skipped || ${JSON.stringify(entry)}::jsonb WHERE id = ${runId}::uuid`;
      }
    });
  }

  private async finishIfDone(org: string, entity: string, runId: string) {
    await this.scoped(org, entity, async (tx) => {
      const r = await tx.arrearsRun.findFirst({ where: { id: runId } });
      if (!r || r.status === 'done' || r.drafted + (r.skipped as unknown[]).length < r.people) return;
      await tx.arrearsRun.update({ where: { id: r.id }, data: { status: 'done', finishedAt: new Date() } });
      if (r.kind === 'rule' && r.mode === 'preview')
        await tx.statutoryArrearsProposal.updateMany({ where: { organizationId: org, id: r.ref }, data: { impactStatus: 'ready', impactPeople: r.drafted, impactTotal: r.total, impactLargest: r.largest } });
      await audit(tx, { ...this.sys(org), userId: r.createdBy }, 'payroll.arrears.run_done', 'arrears_run', r.id, { kind: r.kind, mode: r.mode, people: r.people, done: r.drafted, total: r.total.toFixed(2), largest: r.largest.toFixed(2) });
    });
  }

  // ------------------------------------------------------------------------------------------ statutory proposals (2787)

  private async proposal(tx: Tx, c: CompanyContext, user: ScopeUser, id: string) {
    const v = await payViewer(this.prisma, this.tenantPrisma, user);
    requireSelf(v);
    const ids = await entitiesFor(tx, c, v, 'payroll.arrears.approve');
    await payScope(tx, ids);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`proposal:${id}`}))`;
    const p = await tx.statutoryArrearsProposal.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!p || !ids.includes(p.legalEntityId)) throw new NotFoundException('Not found');
    if (p.status !== 'open') throw new ConflictException(`This proposal is already ${p.status}.`);
    return { p, userId: v.userId! };
  }

  private async items(tx: Tx, org: string, p: { legalEntityId: string; periods: Prisma.JsonValue; employees: Prisma.JsonValue }): Promise<ArrearsItem[]> {
    const periods = (p.periods as string[]).sort();
    const out: ArrearsItem[] = [];
    for (const employeeId of p.employees as string[]) {
      const em = await tx.employment.findFirst({ where: { organizationId: org, employeeId, legalEntityId: p.legalEntityId }, orderBy: { joinedOn: 'desc' }, select: { id: true } });
      if (em) out.push({ employmentId: em.id, from: periods[0]!, to: periods[periods.length - 1]! });
    }
    return out;
  }

  /** 2652/2787: works out the proposal's people, total and largest change, nothing drafted (once per proposal). */
  async previewProposal(ctx: TenantContext, user: ScopeUser, id: string) {
    const started = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { p, userId } = await this.proposal(tx, c, user, id);
      const s = await this.open(tx, c.organizationId, p.legalEntityId, 'rule', p.id, 'preview', userId, await this.items(tx, c.organizationId, p));
      await tx.statutoryArrearsProposal.update({ where: { id: p.id }, data: { impactStatus: 'running' } });
      return s;
    });
    if (started) await this.enqueue(ctx.organizationId!, started.entity, started.runId, started.items);
    return { id, impactStatus: 'running' };
  }

  /** Accept (review item 6): the drafts are made by the same job in chunks; the acceptor is their maker. */
  async acceptProposal(ctx: TenantContext, user: ScopeUser, id: string) {
    const started = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { p, userId } = await this.proposal(tx, c, user, id);
      // 2652: the impact (people, total, largest change) is seen before drafts are made for everyone.
      if (p.impactStatus !== 'ready') throw new ConflictException('Work out the impact first: people, total and the largest change.');
      const s = await this.open(tx, c.organizationId, p.legalEntityId, 'rule', p.id, 'draft', userId, await this.items(tx, c.organizationId, p));
      await tx.statutoryArrearsProposal.update({ where: { id: p.id }, data: { status: 'accepted', decidedBy: userId, decidedAt: new Date() } });
      await audit(tx, c, 'payroll.arrears.proposal_accepted', 'statutory_arrears_proposal', p.id, { statute: p.statute, ruleVersion: p.ruleVersion, people: s?.items.length ?? 0 });
      return s;
    });
    if (started) await this.enqueue(ctx.organizationId!, started.entity, started.runId, started.items);
    return { id, status: 'accepted', runId: started?.runId ?? null };
  }

  /** The arrears jobs of the entities the viewer approves arrears in (newest first): what each drafted or would come to. */
  async runs(ctx: TenantContext, user: ScopeUser) {
    const v = await payViewer(this.prisma, this.tenantPrisma, user);
    requireSelf(v);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = await entitiesFor(tx, c, v, 'payroll.arrears.approve');
      await payScope(tx, ids);
      const rows = await tx.arrearsRun.findMany({ where: { organizationId: c.organizationId, legalEntityId: { in: ids } }, orderBy: { createdAt: 'desc' }, take: 100 });
      const people = [...new Set(rows.flatMap((r) => (r.largestEmployeeId ? [r.largestEmployeeId] : [])))];
      const names = new Map((people.length ? await tx.employee.findMany({ where: { organizationId: c.organizationId, id: { in: people } }, select: { id: true, givenName: true, familyName: true } }) : []).map((e) => [e.id, `${e.givenName} ${e.familyName ?? ''}`.trim()]));
      return rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        ref: r.ref,
        mode: r.mode,
        status: r.status,
        people: r.people,
        done: r.drafted,
        skipped: (r.skipped as { employmentId: string | null; why: string | null }[]).filter((x) => x.why),
        total: r.total.toFixed(2),
        largest: r.largest.toFixed(2),
        largestPerson: r.largestEmployeeId ? (names.get(r.largestEmployeeId) ?? null) : null,
        createdAt: r.createdAt.toISOString(),
        finishedAt: r.finishedAt?.toISOString() ?? null,
      }));
    });
  }
}

