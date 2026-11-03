import { Inject, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { DocumentsModule } from '../documents/documents.module';
import { REDIS_CONNECTION, bullOpts, createRedisConnection, logBullErrors } from '../jobs/redis-connection';
import { NotificationsModule } from '../notifications/notifications.module';
import { AccidentsController } from './accidents.controller';
import { AccidentsService } from './accidents.service';

const QUEUE = 'accident-jobs';

/** HLP-12: every morning at 09:00 India time, remind the safety team about contractors who have not filed. */
@Injectable()
export class AccidentJobs implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AccidentJobs.name);
  private readonly queue: Queue;
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: Redis,
    private readonly accidents: AccidentsService,
  ) {
    this.queue = logBullErrors(new Queue(QUEUE, bullOpts(connection)), QUEUE);
  }

  async onModuleInit() {
    this.worker = logBullErrors(new Worker(QUEUE, () => this.run(), bullOpts(this.connection)), QUEUE);
    await this.queue.upsertJobScheduler('contractor-reminders', { pattern: '0 9 * * *', tz: 'Asia/Kolkata' }, { name: 'reminders', data: {} });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue.close();
  }

  async run() {
    const n = await this.accidents.remindAll().catch((e: Error) => (this.logger.warn(`reminders: ${e.message}`), 0));
    if (n) this.logger.log(`contractor reminders: ${n}`);
  }
}

// HLP-12 accident cases: reports, the safety team's workspace, ESIC and EC clocks, medical records.
@Module({
  imports: [DocumentsModule, NotificationsModule],
  controllers: [AccidentsController],
  providers: [{ provide: REDIS_CONNECTION, useFactory: createRedisConnection }, AccidentsService, AccidentJobs],
})
export class AccidentsModule {}
