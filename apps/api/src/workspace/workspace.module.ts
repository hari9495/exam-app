import { Module } from '@nestjs/common';
import { EmployeeHistoryModule } from '../employee-history/employee-history.module';
import { PeopleModule } from '../people/people.module';
import { WorkspaceController } from './workspace.controller';
import { WorkspaceService } from './workspace.service';

// Global search (Ctrl K) and the side-menu counts for the YukthiX app frame.
@Module({
  imports: [EmployeeHistoryModule, PeopleModule],
  providers: [WorkspaceService],
  controllers: [WorkspaceController],
})
export class WorkspaceModule {}
