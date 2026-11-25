import { Inject, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { CryptoModule } from '@exam-platform/shared';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { DocumentsModule } from '../documents/documents.module';
import { REDIS_CONNECTION, bullOpts, createRedisConnection, logBullErrors } from '../jobs/redis-connection';
import { NotificationsModule } from '../notifications/notifications.module';
import { MyPoliciesController, PoliciesAdminController } from './policies.controller';
import { PoliciesService } from './policies.service';
import { PolicyWriterController } from './policy-writer.controller';
import { PolicyWriterService } from './policy-writer.service';

const QUEUE = 'policy-jobs';

/** HLP-10 / HLP-11: every morning at 09:00 India time, reminders and manager notices on each company's schedule; HLP-14: the draft clean-up. */
@Injectable()
export class PolicyJobs implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PolicyJobs.name);
  private readonly queue: Queue;
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: Redis,
    private readonly policies: PoliciesService,
    private readonly writer: PolicyWriterService,
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
    // HLP-14 (answer 106): unapproved AI drafts untouched for the company's days are discarded.
    const d = await this.writer.discardExpired().catch((e: Error) => (this.logger.warn(`policy drafts clean-up: ${e.message}`), 0));
    if (d) this.logger.log(`policy drafts discarded: ${d}`);
  }
}

// HLP-10 / HLP-11 company policies: the library people acknowledge and HR's policy admin; HLP-14 writes drafts with the
// company's AI (AiModule: provider and credit limit; CryptoModule: whether a provider is set up).
@Module({
  imports: [AuthModule, DocumentsModule, NotificationsModule, AiModule, CryptoModule],
  controllers: [PoliciesAdminController, MyPoliciesController, PolicyWriterController],
  providers: [{ provide: REDIS_CONNECTION, useFactory: createRedisConnection }, PoliciesService, PolicyJobs, PolicyWriterService],
})
export class PoliciesModule {}
