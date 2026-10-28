import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { TenantPrismaService } from '@exam-platform/shared';
import { REDIS_CONNECTION, logBullErrors, bullOpts } from '../jobs/redis-connection';
import { CompanyContext, Tx } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { LicencesService } from './licences.service';

const QUEUE = 'licence-jobs';

/**
 * TIM-40 reminders before a licence expires: every morning, each company's people whose licence reaches one of the type's
 * lead days are told once (licence_reminders is the record, so a re-run sends nothing twice); a per-company lock means
 * two servers never remind the same company at once. Failures are logged per company and the run carries on.
 */
@Injectable()
export class LicenceJobs implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LicenceJobs.name);
  private readonly queue: Queue;
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: Redis,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly licences: LicencesService,
  ) {
    this.queue = logBullErrors(new Queue(QUEUE, bullOpts(connection)), QUEUE);
  }

  async onModuleInit() {
    this.worker = logBullErrors(new Worker(QUEUE, () => this.run(), bullOpts(this.connection)), QUEUE);
    await this.queue.upsertJobScheduler('licence-remind', { pattern: '0 8 * * *', tz: 'Asia/Kolkata' }, { name: 'remind', data: {} });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue.close();
  }

  async run(today = todayIst(), only?: string[]): Promise<number> {
    const orgs = only ?? (await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.$queryRaw<{ id: string }[]>`SELECT DISTINCT organization_id::text AS id FROM employee_licences WHERE removed_at IS NULL`)).map((r) => r.id);
    let sent = 0;
    for (const org of orgs) {
      const c: CompanyContext = { organizationId: org, isSuperAdmin: false, userId: null };
      try {
        sent += await this.licences.remindCompany(c, org, today, <T>(fn: (tx: Tx, c: CompanyContext) => Promise<T>) => this.tenantPrisma.forTenant(c, (tx) => fn(tx as Tx, c)));
      } catch (e) {
        this.logger.error(`licence reminders ${org}: ${(e as Error).message}`);
      }
    }
    this.logger.log(`licence reminders: ${sent} sent in ${orgs.length} companies`);
    return sent;
  }
}
