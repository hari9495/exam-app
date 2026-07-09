import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@exam-platform/shared';
import { CandidateAuthModule } from './candidate-auth/candidate-auth.module';
import { AttemptModule } from './attempts/attempt.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { ProctoringAnalysisModule } from './proctoring-analysis/proctoring-analysis.module';
import { GradingModule } from './grading/grading.module';
import { InternalModule } from './internal/internal.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CandidateAuthModule,
    AttemptModule,
    MonitoringModule,
    ProctoringAnalysisModule,
    GradingModule,
    InternalModule,
  ],
})
export class AppModule {}
