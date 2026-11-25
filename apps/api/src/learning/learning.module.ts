import { Inject, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { AuthModule } from '../auth/auth.module';
import { DocumentsModule } from '../documents/documents.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { REDIS_CONNECTION, bullOpts, createRedisConnection, logBullErrors } from '../jobs/redis-connection';
import { CoursesController, MyLearningController, MySessionsController, SessionsController } from './learning.controller';
import { CoursesService } from './courses.service';
import { SessionsService } from './sessions.service';

const QUEUE = 'learning-jobs';

/** Batch G3: every morning at 09:00 India time, managers are asked to check whether their team applies what it learnt. */
@Injectable()
export class LearningJobs implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LearningJobs.name);
  private readonly queue: Queue;
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: Redis,
    private readonly sessions: SessionsService,
  ) {
    this.queue = logBullErrors(new Queue(QUEUE, bullOpts(connection)), QUEUE);
  }

  async onModuleInit() {
    this.worker = logBullErrors(new Worker(QUEUE, () => this.run(), bullOpts(this.connection)), QUEUE);
    await this.queue.upsertJobScheduler('learning-daily', { pattern: '0 9 * * *', tz: 'Asia/Kolkata' }, { name: 'learning', data: {} });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue.close();
  }

  async run() {
    const n = await this.sessions.askChecks().catch((e: Error) => (this.logger.warn(`training checks: ${e.message}`), 0));
    if (n) this.logger.log(`training checks asked for ${n} sessions`);
  }
}

// Batch G3 (M07 Learning): courses, the catalogue, my learning and certificates (G3a); sessions and feedback (G3b).
@Module({
  imports: [AuthModule, DocumentsModule, NotificationsModule],
  controllers: [CoursesController, MyLearningController, SessionsController, MySessionsController],
  providers: [{ provide: REDIS_CONNECTION, useFactory: createRedisConnection }, CoursesService, SessionsService, LearningJobs],
})
export class LearningModule {}
