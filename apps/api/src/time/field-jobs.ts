import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { TenantPrismaService } from '@exam-platform/shared';
import { REDIS_CONNECTION, logBullErrors, bullOpts } from '../jobs/redis-connection';
import { CompanyContext, audit } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { SETTINGS, resolveSetting } from '../org-structure/settings-registry';
import { asDate } from './time-core';
import { retentionCutoff } from './field-rules';

const QUEUE = 'field-jobs';

export interface RetentionRun {
  organizationId: string;
  status: 'done' | 'skipped' | 'failed';
  deleted: number;
  cutoff?: string;
  error?: string;
}

/**
 * Field force trail retention (DPDP Act 2023 s.8(7)): every night, each company's location readings older than
 * `field.trail_retention_days` are deleted. Safe to re-run (a second run finds nothing older); a per-company
 * transaction lock means two servers never purge the same company at once (the second skips it). Each company's
 * result is logged, and a purge or a failure is audited in that company.
 */
@Injectable()
export class FieldJobs implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FieldJobs.name);
  private readonly queue: Queue;
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: Redis,
    private readonly tenantPrisma: TenantPrismaService,
  ) {
    this.queue = logBullErrors(new Queue(QUEUE, bullOpts(connection)), QUEUE);
  }

  async onModuleInit() {
    this.worker = logBullErrors(new Worker(QUEUE, () => this.retention(), bullOpts(this.connection)), QUEUE);
    // 02:30 IST, after the day engine's evening runs.
    await this.queue.upsertJobScheduler('field-retention', { pattern: '30 2 * * *', tz: 'Asia/Kolkata' }, { name: 'retention', data: {} });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue.close();
  }

  /** Companies that hold any reading (the platform view, ids only; each purge runs in that company's context). */
  private async companies(): Promise<string[]> {
    const rows = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.$queryRaw<{ id: string }[]>`SELECT DISTINCT organization_id::text AS id FROM location_pings`);
    return rows.map((r) => r.id);
  }

  async retention(today = todayIst(), only?: string[]): Promise<RetentionRun[]> {
    const runs: RetentionRun[] = [];
    for (const org of only ?? (await this.companies())) runs.push(await this.purge(org, today));
    const deleted = runs.reduce((s, r) => s + r.deleted, 0);
    const failed = runs.filter((r) => r.status === 'failed');
    if (failed.length) this.logger.error(`field retention: ${failed.length} of ${runs.length} companies failed (${failed.map((r) => `${r.organizationId}: ${r.error}`).join('; ')})`);
    this.logger.log(`field retention: ${deleted} readings deleted in ${runs.length} companies`);
    return runs;
  }

  async purge(org: string, today: string): Promise<RetentionRun> {
    const c: CompanyContext = { organizationId: org, isSuperAdmin: false, userId: null };
    try {
      return await this.tenantPrisma.forTenant(c, async (tx) => {
        const [lock] = await tx.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext(${`field-retention:${org}`})) AS ok`;
        if (!lock?.ok) return { organizationId: org, status: 'skipped' as const, deleted: 0 };
        const rows = await tx.setting.findMany({ where: { organizationId: org, key: 'field.trail_retention_days' } });
        const days = Number(resolveSetting(SETTINGS['field.trail_retention_days'], rows.map((r) => ({ id: r.id, scopeType: r.scopeType, scopeId: r.scopeId, value: r.value, validFrom: null })), { tenant: org }, null).value);
        const cutoff = retentionCutoff(today, days);
        const { count } = await tx.locationPing.deleteMany({ where: { organizationId: org, workOn: { lt: asDate(cutoff) } } });
        if (count) await audit(tx, c, 'time.field.trail_purged', 'organization', org, { cutoff, days, deleted: count });
        return { organizationId: org, status: 'done' as const, deleted: count, cutoff };
      });
    } catch (e) {
      const error = (e as Error).message.slice(0, 300);
      // The failure is recorded in the company's audit trail too, so it is visible beyond the server log.
      await this.tenantPrisma.forTenant(c, (tx) => audit(tx, c, 'time.field.trail_purge_failed', 'organization', org, { error })).catch(() => undefined);
      return { organizationId: org, status: 'failed', deleted: 0, error };
    }
  }
}
