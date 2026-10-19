import { Module } from '@nestjs/common';
import { EmployeeHistoryModule } from '../employee-history/employee-history.module';
import { PeopleModule } from '../people/people.module';
import { REDIS_CONNECTION, createRedisConnection } from '../jobs/redis-connection';
import { WorkspaceController } from './workspace.controller';
import { WorkspaceService } from './workspace.service';
import { HomeSnapshotJobs } from './home-snapshot.jobs';

// Global search (Ctrl K), the side-menu counts and the Home for the YukthiX app frame.
@Module({
  imports: [EmployeeHistoryModule, PeopleModule],
  providers: [WorkspaceService, HomeSnapshotJobs, { provide: REDIS_CONNECTION, useFactory: createRedisConnection }],
  controllers: [WorkspaceController],
})
export class WorkspaceModule {}
