import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrgStructureModule } from '../org-structure/org-structure.module';
import { ProjectsController } from './projects.controller';
import { MappingRulesController } from './mapping-rules.controller';
import { ProjectMappingService } from './project-mapping.service';
import { WORK_TOOLS, workToolsFromEnv } from '../time/providers/work-tools';
import { ProjectsService } from './projects.service';
import { ResourcingController } from './resourcing.controller';
import { ResourcingService } from './resourcing.service';
import { CostController } from './cost.controller';
import { ProjectCostService } from './project-cost.service';

// Projects P-1 (answers 1401 to 1405, 1412, 1420): projects core.
@Module({
  imports: [AuthModule, NotificationsModule, OrgStructureModule],
  // P-3: its own work-tools adapter (stateless) for "Test against last week".
  providers: [ProjectsService, ProjectMappingService, ResourcingService, ProjectCostService, { provide: WORK_TOOLS, useFactory: workToolsFromEnv }],
  controllers: [MappingRulesController, ResourcingController, CostController, ProjectsController],
  exports: [ProjectsService, ProjectCostService],
})
export class ProjectsModule {}
