import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CryptoModule } from '@exam-platform/shared';
import { EmailModule } from '../email/email.module';
import { EmployeeHistoryModule } from '../employee-history/employee-history.module';
import { REDIS_CONNECTION, createRedisConnection } from '../jobs/redis-connection';
import { NotificationsModule } from '../notifications/notifications.module';
import { PeopleModule } from '../people/people.module';
import { RulesEngineModule } from '../rules-engine/rules-engine.module';
import { ServiceDeskModule } from '../service-desk/service-desk.module';
import { DocumentsModule } from '../documents/documents.module';
import { JoinersService } from './joiners.service';
import { JoiningService } from './joining.service';
import { LifecycleJourneysService } from './journeys.service';
import { LifeEventsService } from './life-events.service';
import { LifecycleController } from './lifecycle.controller';
import { ExitsController } from './exits.controller';
import { ExitsService } from './exits.service';
import { OffboardingService } from './offboarding.service';
import { LastDayService } from './last-day.service';
import { AlumniPortalService } from './alumni.service';
import { AlumniPortalController } from './alumni.controller';
import { OnboardingExtrasService } from './onboarding-extras.service';
import { ExitExtrasService } from './exit-extras.service';
import { SpecialCasesController } from './special-cases.controller';
import { WorkflowModule } from '../workflow/workflow.module';
import { LifecycleJobs } from './lifecycle-jobs';
import { PreboardingPortalController } from './portal.controller';
import { PreboardingPortalService } from './portal.service';

// M01 lifecycle: checklists and joiners (6a); the pre-boarding portal, joining, BGV and the ATS hand-off (6b); probation
// reviews, resignations, company exits, clearance, exit interviews and assets (6c).
@Module({
  imports: [WorkflowModule, NotificationsModule, RulesEngineModule, ServiceDeskModule, DocumentsModule, AuthModule, CryptoModule, EmailModule, EmployeeHistoryModule, PeopleModule],
  controllers: [LifecycleController, PreboardingPortalController, ExitsController, AlumniPortalController, SpecialCasesController],
  providers: [{ provide: REDIS_CONNECTION, useFactory: createRedisConnection }, LifecycleJourneysService, JoinersService, JoiningService, PreboardingPortalService, LifecycleJobs, ExitsService, OffboardingService, LastDayService, AlumniPortalService, OnboardingExtrasService, ExitExtrasService, LifeEventsService],
  exports: [LifecycleJourneysService],
})
export class LifecycleModule {}
