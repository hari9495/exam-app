import { Module } from '@nestjs/common';
import { CryptoModule } from '@exam-platform/shared';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { DocumentsModule } from '../documents/documents.module';
import { EmployeeHistoryModule } from '../employee-history/employee-history.module';
import { PayrollModule } from '../payroll/payroll.module';
import { REDIS_CONNECTION, createRedisConnection } from '../jobs/redis-connection';
import { NotificationsModule } from '../notifications/notifications.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { PerformanceFeedbackController } from './feedback.controller';
import { PerformanceFeedbackService } from './feedback.service';
import { PerformanceGoalsController } from './goals.controller';
import { PerformanceGoalsService } from './goals.service';
import { PerformanceHomeController } from './home.controller';
import { PerformanceHomeService } from './home.service';
import { PerformanceJobs } from './perf-jobs';
import { PerformanceCalibrationController } from './calibration.controller';
import { PerformanceCompController } from './comp.controller';
import { PerformanceCompService } from './comp.service';
import { PerformancePipsController } from './pips.controller';
import { PerformancePipsService } from './pips.service';
import { LifecycleModule } from '../lifecycle/lifecycle.module';
import { PerformanceCalibrationService } from './calibration.service';
import { PerformancePeerController } from './peer.controller';
import { PerformancePeerService } from './peer.service';
import { PerformanceReviewsController } from './reviews.controller';
import { PerformanceReportsService } from './reports.service';
import { PerformanceReviewsService } from './reviews.service';
import { PerformanceSetupController } from './setup.controller';
import { PerformanceSetupService } from './setup.service';
import { PerformanceB3Controller } from './b3.controller';
import { PerformanceHandoversService } from './handovers.service';
import { PerformanceDisputesService } from './disputes.service';
import { PerformanceCoachService } from './coach.service';
import { ReviewDraftClient } from './review-draft.client';

// M06 performance (M06-BUILD-DESIGN §4). PM1: set-up (rating scales, review templates, skills library, competencies).
// PM2: goals and OKRs (periods, alignment, key results, approval, check-ins and reminders).
// PM3: feedback, requests for feedback, 1:1s and HR sealing of concerns.
// PM4: review cycles (eligibility, launch) and reviews (self and manager stages, scoring, reminders).
// PM5: peer and 360° feedback (nominations, anonymous groups, reviewer blocks, reveal for abuse).
// PM6: calibration (sessions, guide, changes with reasons, sign-off) and reports with suppression.
// PM8: improvement plans (proposal, HR approval, acknowledgement, check-ins, pause, outcome, the exit link).
// PRF-01: the performance home (one read per role over the same services).
// PM7: ratings to pay (matrices, comp cycles, budgets, proposals, approval, apply to P06 and payroll, pay band, pay equity).
// Builder 3: PRF-13 hand-over list, PRF-15 disputes and evidence export, PRF-16 manager coach and suggested 1:1 agenda,
// PRF-17 review assistant (AI drafting through AiInvocationService) and bias check.
@Module({
  imports: [AuthModule, WorkflowModule, NotificationsModule, PayrollModule, EmployeeHistoryModule, DocumentsModule, LifecycleModule, AiModule, CryptoModule],
  controllers: [PerformanceHomeController, PerformanceSetupController, PerformanceGoalsController, PerformanceFeedbackController, PerformanceReviewsController, PerformancePeerController, PerformanceCalibrationController, PerformanceCompController, PerformancePipsController, PerformanceB3Controller],
  providers: [{ provide: REDIS_CONNECTION, useFactory: createRedisConnection }, PerformanceSetupService, PerformanceGoalsService, PerformanceFeedbackService, PerformanceReviewsService, PerformancePeerService, PerformanceCalibrationService, PerformanceReportsService, PerformanceCompService, PerformancePipsService, PerformanceJobs, PerformanceHandoversService, PerformanceDisputesService, PerformanceCoachService, ReviewDraftClient, PerformanceHomeService],
  exports: [PerformanceSetupService, PerformanceGoalsService],
})
export class PerformanceModule {}
