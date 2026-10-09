import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { REDIS_CONNECTION, logBullErrors } from '../jobs/redis-connection';
import { PayAuditService } from './audit.service';
import { PayDocumentsService } from './documents.service';
import { PaySetupService } from './setup.service';

const QUEUE = 'payroll-jobs';
const DAY = 24 * 3_600_000;

/** Daily on BullMQ: the audit chain check with anchors and alerts (YX-AUD-03), the audit archive (YX-AUD-08), document retention (YX-DOC-13), statutory coverage (PAY-2.11). */
@Injectable()
export class PayrollJobs implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PayrollJobs.name);
  private readonly queue: Queue;
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: Redis,
    private readonly audit: PayAuditService,
    private readonly documents: PayDocumentsService,
    private readonly setup: PaySetupService,
  ) {
    this.queue = logBullErrors(new Queue(QUEUE, { connection }), QUEUE);
  }

  async onModuleInit() {
    this.worker = logBullErrors(new Worker(QUEUE, (job) => this.handle(job.name), { connection: this.connection }), QUEUE);
    await this.queue.upsertJobScheduler('payroll-audit-verify', { every: DAY }, { name: 'audit-verify', data: {} });
    await this.queue.upsertJobScheduler('payroll-audit-archive', { every: DAY }, { name: 'audit-archive', data: {} });
    await this.queue.upsertJobScheduler('payroll-document-retention', { every: DAY }, { name: 'document-retention', data: {} });
    await this.queue.upsertJobScheduler('payroll-coverage', { every: DAY }, { name: 'coverage', data: {} });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue.close();
  }

  async handle(name: string): Promise<unknown> {
    if (name === 'audit-verify') {
      const broken = await this.audit.verifyAll();
      if (broken) this.logger.error(`audit chain check: ${broken} broken`);
      return broken;
    }
    if (name === 'audit-archive') return this.audit.archiveAll();
    if (name === 'document-retention') return this.documents.purgeExpired();
    if (name === 'coverage') return this.setup.evaluateCoverage();
    return null;
  }
}
