import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrgStructureModule } from '../org-structure/org-structure.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

// Projects P-1 (answers 1401 to 1405, 1412, 1420): projects core.
@Module({
  imports: [AuthModule, NotificationsModule, OrgStructureModule],
  providers: [ProjectsService],
  controllers: [ProjectsController],
  exports: [ProjectsService],
})
export class ProjectsModule {}
