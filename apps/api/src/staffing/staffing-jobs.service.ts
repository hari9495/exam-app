import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { TenantPrismaService } from '@exam-platform/shared';
import { REDIS_CONNECTION, bullOpts, logBullErrors } from '../jobs/redis-connection';
import { audit, CompanyContext, Tx } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { addDays, benchLop } from './billing-rules';
import { withPayScope } from '../payroll/pay-access';

export const STAFFING_JOBS_QUEUE = 'staffing-jobs';
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const SYSTEM = (org: string): CompanyContext => ({ organizationId: org, isSuperAdmin: false, userId: null }) as CompanyContext;

/**
 * The staffing desk's nightly job (01:30 India time; idempotent, so a second run or a second server does no harm).
 * Answer 483: an own-payroll placement past its last day is ended once (reason completed, audited) and the person goes on
 * the bench from the next day, unless they are already re-placed or on the bench. Answer 482: for each finished pay
 * month, every bench spell in it is sent once to payroll as loss-of-pay days through the existing LOP input (the unpaid
 * share of bench pay, `staffing.bench.pay_pct`; past `staffing.bench.max_days` with `staffing.bench.after` = unpaid,
 * the whole day). A locked or frozen pay month is skipped and logged (payroll corrects it). The exit review stays manual.
 */
@Injectable()
export class StaffingJobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StaffingJobsService.name);
  private readonly queue: Queue;
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: Redis,
    private readonly tenantPrisma: TenantPrismaService,
  ) {
    this.queue = logBullErrors(new Queue(STAFFING_JOBS_QUEUE, bullOpts(connection)), STAFFING_JOBS_QUEUE);
  }

  async onModuleInit() {
    this.worker = logBullErrors(new Worker(STAFFING_JOBS_QUEUE, (job) => this.run(job), bullOpts(this.connection)), STAFFING_JOBS_QUEUE);
    await this.queue.upsertJobScheduler('staffing-nightly', { pattern: '30 1 * * *', tz: 'Asia/Kolkata' }, { name: 'nightly', data: {} });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue.close();
  }

  private async run(job: Job) {
    if (job.name !== 'nightly') return;
    const done = await Promise.allSettled([this.endPlacements(), this.benchPay()]);
    for (const r of done) if (r.status === 'rejected') this.logger.warn(`nightly: ${(r.reason as Error)?.message}`);
  }

  private orgs(sql: 'placements' | 'bench') {
    return this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      sql === 'placements'
        ? tx.staffingPlacement.findMany({ where: { supply: 'own', status: 'active', endOn: { lt: day(todayIst()) } }, distinct: ['organizationId'], select: { organizationId: true } })
        : tx.staffingBench.findMany({ distinct: ['organizationId'], select: { organizationId: true } }),
    );
  }

  /** Answer 483. Returns the number of placements ended. */
  async endPlacements(today = todayIst()): Promise<number> {
    let n = 0;
    for (const { organizationId: org } of await this.orgs('placements')) {
      n += await this.tenantPrisma
        .forTenant({ organizationId: org, isSuperAdmin: false }, async (tx) => {
          const due = await tx.staffingPlacement.findMany({ where: { organizationId: org, supply: 'own', status: 'active', endOn: { lt: day(today) } }, take: 500 });
          let ended = 0;
          for (const p of due) {
            // Once per placement: only a row still active is ended (a parallel run ends nothing twice).
            const { count } = await tx.staffingPlacement.updateMany({ where: { id: p.id, status: 'active' }, data: { status: 'ended', endedReason: 'completed', version: { increment: 1 } } });
            if (!count) continue;
            ended++;
            const next = addDays(iso(p.endOn)!, 1);
            const replaced = await tx.staffingPlacement.findFirst({ where: { organizationId: org, employeeId: p.employeeId, id: { not: p.id }, startOn: { gte: p.startOn }, OR: [{ status: 'active' }, { endOn: { gte: day(next) } }] }, select: { id: true } });
            const onBench = await tx.staffingBench.findFirst({ where: { organizationId: org, employeeId: p.employeeId!, untilOn: null }, select: { id: true } });
            const employed = await tx.employment.findFirst({ where: { organizationId: org, employeeId: p.employeeId!, exitedOn: null }, select: { id: true } });
            const bench = !replaced && !onBench && employed ? await tx.staffingBench.create({ data: { organizationId: org, employeeId: p.employeeId!, sinceOn: day(next), lastClientId: p.clientId } }) : null;
            await audit(tx, SYSTEM(org), 'staffing.placement.completed', 'staffing_placement', p.id, { endOn: iso(p.endOn), bench: bench ? next : null, skipped: bench ? null : replaced ? 're-placed' : onBench ? 'already on the bench' : 'not an employee' });
          }
          return ended;
        })
        .catch((e: Error) => (this.logger.warn(`end placements ${org}: ${e.message}`), 0));
    }
    return n;
  }

  /** Answer 482: the previous pay month's bench spells, once each. Returns the number sent. */
  async benchPay(today = todayIst()): Promise<number> {
    const first = `${today.slice(0, 7)}-01`;
    const month = addDays(first, -1).slice(0, 7);
    let n = 0;
    for (const { organizationId: org } of await this.orgs('bench')) {
      n += await this.tenantPrisma
        .forTenant({ organizationId: org, isSuperAdmin: false }, (tx) => this.benchPayIn(tx, org, month))
        .catch((e: Error) => (this.logger.warn(`bench pay ${org}/${month}: ${e.message}`), 0));
    }
    return n;
  }

  private async benchPayIn(tx: Tx, org: string, month: string) {
    const c = SYSTEM(org);
    const from = `${month}-01`;
    const to = addDays(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)).toISOString().slice(0, 10), -1);
    const spells = await tx.staffingBench.findMany({ where: { organizationId: org, sinceOn: { lte: day(to) }, OR: [{ untilOn: null }, { untilOn: { gte: day(from) } }] } });
    if (!spells.length) return 0;
    const sent = new Set((await tx.staffingBenchPay.findMany({ where: { organizationId: org, month: day(from), benchId: { in: spells.map((s) => s.id) } }, select: { benchId: true } })).map((x) => x.benchId));
    const payPct = Number(await settingFor(tx, c, 'staffing.bench.pay_pct', { legalEntityId: '' }));
    const maxDays = Number(await settingFor(tx, c, 'staffing.bench.max_days', { legalEntityId: '' }));
    const after = await settingFor(tx, c, 'staffing.bench.after', { legalEntityId: '' });
    let n = 0;
    for (const s of spells) {
      if (sent.has(s.id)) continue;
      const e = await tx.employment.findFirst({ where: { organizationId: org, employeeId: s.employeeId, exitedOn: null }, orderBy: { joinedOn: 'desc' } });
      if (!e) continue;
      const r = benchLop(iso(s.sinceOn)!, iso(s.untilOn), month, payPct, maxDays, after === 'unpaid');
      if (!r.benchDays) continue;
      const period = await tx.payPeriod.findFirst({ where: { organizationId: org, legalEntityId: e.legalEntityId, payGroupId: null, periodStart: day(from) }, select: { stage: true } });
      if (period && ['locked', 'filed', 'frozen'].includes(period.stage)) {
        this.logger.warn(`bench pay ${org}: ${month} is ${period.stage} for an entity; payroll corrects it`);
        continue;
      }
      // The pay guard opens to this one entity for the system write (the same LOP input payroll reads).
      if (r.lopDays !== '0.00') await withPayScope(tx, [e.legalEntityId], async () => {
        const key = { organizationId_employmentId_periodStart: { organizationId: org, employmentId: e.id, periodStart: day(from) } };
        const cur = await tx.lopInput.findUnique({ where: key });
        const note = `Bench ${r.benchDays} days at ${payPct}% pay`;
        if (cur) await tx.lopInput.update({ where: key, data: { lopDays: (Number(cur.lopDays) + Number(r.lopDays)).toFixed(2), reason: `${cur.reason}; ${note}`.slice(0, 300) } });
        else await tx.lopInput.create({ data: { organizationId: org, legalEntityId: e.legalEntityId, employeeId: s.employeeId, employmentId: e.id, periodStart: day(from), lopDays: r.lopDays, reason: note, source: 'bench', enteredBy: s.createdBy ?? '00000000-0000-0000-0000-000000000000' } });
      });
      await tx.staffingBenchPay.create({ data: { organizationId: org, benchId: s.id, employmentId: e.id, month: day(from), benchDays: r.benchDays, lopDays: r.lopDays, payPct } });
      await audit(tx, c, 'staffing.bench_pay.sent', 'staffing_bench', s.id, { month, benchDays: r.benchDays, lopDays: r.lopDays, payPct });
      n++;
    }
    return n;
  }
}
