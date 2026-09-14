import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService], // ScheduledReportsService reuses getAnalytics/getSummary for the weekly digest
})
export class DashboardModule {}
