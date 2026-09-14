import { Module } from '@nestjs/common';
import { CryptoModule } from '@exam-platform/shared';
import { DashboardModule } from '../dashboard/dashboard.module';
import { EmailModule } from '../email/email.module';
import { ScheduledReportsService } from './scheduled-reports.service';

// Weekly scheduled-report digest sweep. CryptoModule → TenantPrismaService; DashboardModule →
// getAnalytics/getSummary; EmailModule → EmailService (HTML + CSV attachment). Opt-in per org.
@Module({
  imports: [CryptoModule, DashboardModule, EmailModule],
  providers: [ScheduledReportsService],
})
export class ScheduledReportsModule {}
