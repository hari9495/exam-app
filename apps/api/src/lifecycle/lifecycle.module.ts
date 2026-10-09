import { Module } from '@nestjs/common';
import { REDIS_CONNECTION, createRedisConnection } from '../jobs/redis-connection';
import { NotificationsModule } from '../notifications/notifications.module';
import { RulesEngineModule } from '../rules-engine/rules-engine.module';
import { ServiceDeskModule } from '../service-desk/service-desk.module';
import { DocumentsModule } from '../documents/documents.module';
import { JoinersService } from './joiners.service';
import { LifecycleJourneysService } from './journeys.service';
import { LifecycleController } from './lifecycle.controller';
import { LifecycleJobs } from './lifecycle-jobs';

// M01 lifecycle, batch 6a (LIFE-1.04 … 1.07): checklist templates, running checklists, joiners before day one.
@Module({
  imports: [NotificationsModule, RulesEngineModule, ServiceDeskModule, DocumentsModule],
  controllers: [LifecycleController],
  providers: [{ provide: REDIS_CONNECTION, useFactory: createRedisConnection }, LifecycleJourneysService, JoinersService, LifecycleJobs],
  exports: [LifecycleJourneysService],
})
export class LifecycleModule {}
