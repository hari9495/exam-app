import { Module } from '@nestjs/common';
import { CryptoModule, AuditModule } from '@exam-platform/shared';
import { JobsModule } from '../jobs/jobs.module';
import { ConnectedAppsController } from './connected-apps.controller';
import { ConnectedAppsService } from './connected-apps.service';

@Module({
  imports: [CryptoModule, AuditModule, JobsModule], // JobsModule provides IntegrationEventsService (enqueueTest)
  controllers: [ConnectedAppsController],
  providers: [ConnectedAppsService],
})
export class IntegrationsModule {}
