import { Inject, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { AuthModule } from '../auth/auth.module';
import { DocumentsModule } from '../documents/documents.module';
import { REDIS_CONNECTION, bullOpts, createRedisConnection, logBullErrors } from '../jobs/redis-connection';
import { NotificationsModule } from '../notifications/notifications.module';
import { MyPoliciesController, PoliciesAdminController } from './policies.controller';
import { PoliciesService } from './policies.service';

const QUEUE = 'policy-jobs';

/** HLP-10 / HLP-11: every morning at 09:00 India time, reminders and manager notices on each company's schedule. */
@Injectable()
export class PolicyJobs implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PolicyJobs.name);
  private readonly queue: Queue;
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: Redis,
    private readonly policies: PoliciesService,
  ) {
    this.queue = logBullErrors(new Queue(QUEUE, bullOpts(connection)), QUEUE);
  }

  async onModuleInit() {
    this.worker = logBullErrors(new Worker(QUEUE, () => this.run(), bullOpts(this.connection)), QUEUE);
    await this.queue.upsertJobScheduler('policy-reminders', { pattern: '0 9 * * *', tz: 'Asia/Kolkata' }, { name: 'reminders', data: {} });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue.close();
  }

  async run() {
    const n = await this.policies.remindAll().catch((e: Error) => (this.logger.warn(`reminders: ${e.message}`), 0));
    if (n) this.logger.log(`reminders: ${n}`);
  }
}

// HLP-10 / HLP-11 company policies: the library people acknowledge and HR's policy admin.
@Module({
  imports: [AuthModule, DocumentsModule, NotificationsModule],
  controllers: [PoliciesAdminController, MyPoliciesController],
  providers: [{ provide: REDIS_CONNECTION, useFactory: createRedisConnection }, PoliciesService, PolicyJobs],
})
export class PoliciesModule {}
