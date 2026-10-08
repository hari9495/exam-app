import { Inject, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { AuditModule } from '@exam-platform/shared';
import { NotificationsModule } from '../notifications/notifications.module';
import { REDIS_CONNECTION, createRedisConnection, logBullErrors } from '../jobs/redis-connection';
import { ApprovalsEngine } from './approvals-engine.service';
import { WorkflowController } from './workflow.controller';

const QUEUE = 'wf-jobs';

/** Reminders and timeouts every 5 minutes (P03 §4.6). Idempotent: each task is locked with its request. */
@Injectable()
export class WorkflowJobs implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkflowJobs.name);
  private readonly queue: Queue;
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: Redis,
    private readonly engine: ApprovalsEngine,
  ) {
    this.queue = logBullErrors(new Queue(QUEUE, { connection }), QUEUE);
  }

  async onModuleInit() {
    this.worker = logBullErrors(
      new Worker(
        QUEUE,
        async () => {
          const n = await this.engine.tick();
          if (n) this.logger.log(`approvals tick: ${n}`);
        },
        { connection: this.connection },
      ),
      QUEUE,
    );
    await this.queue.upsertJobScheduler('wf-tick', { every: 5 * 60_000 }, { name: 'tick', data: {} });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue.close();
  }
}

// P03 approvals engine (shared platform engine): modules register request types with ApprovalsEngine.
@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [WorkflowController],
  providers: [{ provide: REDIS_CONNECTION, useFactory: createRedisConnection }, ApprovalsEngine, WorkflowJobs],
  exports: [ApprovalsEngine],
})
export class WorkflowModule {}
