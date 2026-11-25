import { Inject, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { AuthModule } from '../auth/auth.module';
import { REDIS_CONNECTION, bullOpts, createRedisConnection, logBullErrors } from '../jobs/redis-connection';
import { NotificationsModule } from '../notifications/notifications.module';
import { AnnouncementsController, ModerationController, MyEngageController, SurveysController } from './engage.controller';
import { SurveysService } from './surveys.service';
import { FeedService } from './feed.service';
import { KudosService } from './kudos.service';
import { AnnouncementsService } from './announcements.service';

const QUEUE = 'engage-jobs';

/** Batch G2: every 15 minutes, scheduled announcements whose time has come are sent; the day-2 and day-5 reminders. */
@Injectable()
export class EngageJobs implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EngageJobs.name);
  private readonly queue: Queue;
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: Redis,
    private readonly announcements: AnnouncementsService,
    private readonly surveys: SurveysService,
  ) {
    this.queue = logBullErrors(new Queue(QUEUE, bullOpts(connection)), QUEUE);
  }

  async onModuleInit() {
    this.worker = logBullErrors(new Worker(QUEUE, () => this.run(), bullOpts(this.connection)), QUEUE);
    await this.queue.upsertJobScheduler('engage-every-15', { pattern: '*/15 * * * *', tz: 'Asia/Kolkata' }, { name: 'engage', data: {} });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue.close();
  }

  async run() {
    const sent = await this.announcements.publishDue().catch((e: Error) => (this.logger.warn(`announcements: ${e.message}`), 0));
    const reminded = await this.announcements.remindDue().catch((e: Error) => (this.logger.warn(`announcement reminders: ${e.message}`), 0));
    if (sent || reminded) this.logger.log(`announcements sent ${sent}, reminded ${reminded}`);
    // Batch G2 item 74: three days before a survey closes, people who have not answered are reminded once.
    const surveys = await this.surveys.remindDue().catch((e: Error) => (this.logger.warn(`survey reminders: ${e.message}`), 0));
    if (surveys) this.logger.log(`survey reminders ${surveys}`);
  }
}

// Batch G2 (M09 Engage): announcements (item 12); the feed, kudos, surveys and celebrations follow.
@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [AnnouncementsController, MyEngageController, ModerationController, SurveysController],
  providers: [{ provide: REDIS_CONNECTION, useFactory: createRedisConnection }, AnnouncementsService, FeedService, KudosService, SurveysService, EngageJobs],
})
export class EngageModule {}
