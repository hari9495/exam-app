import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PerformanceSetupController } from './setup.controller';
import { PerformanceSetupService } from './setup.service';

// M06 performance (M06-BUILD-DESIGN §4). PM1: set-up (rating scales, review templates, skills library, competencies).
@Module({
  imports: [AuthModule],
  controllers: [PerformanceSetupController],
  providers: [PerformanceSetupService],
  exports: [PerformanceSetupService],
})
export class PerformanceModule {}
