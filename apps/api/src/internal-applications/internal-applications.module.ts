import { Module } from '@nestjs/common';
import { StorageModule } from '@exam-platform/shared';
import { NotificationsModule } from '../notifications/notifications.module';
import { InternalApplicationsService } from './internal-applications.service';
import { InternalApplicationsController } from './internal-applications.controller';

// HIR-13 internal jobs: an employee's self-application lands as a pipeline entry (enteredVia='internal') through the
// candidate-ingestion primitives (candidate upsert + recomputeGlobalStage). Storage for the optional PDF résumé;
// notifications tell the current manager (founder decision 6). Exported for the offer hook (setting "at the offer").
@Module({
  imports: [StorageModule, NotificationsModule],
  controllers: [InternalApplicationsController],
  providers: [InternalApplicationsService],
  exports: [InternalApplicationsService],
})
export class InternalApplicationsModule {}
