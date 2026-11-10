import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrgStructureModule } from '../org-structure/org-structure.module';
import { EmailModule } from '../email/email.module';
import { PipelineModule } from '../pipeline/pipeline.module';
import { AgencySubmissionsModule } from '../agency-submissions/agency-submissions.module';
import { StaffingWorkService } from './staffing-work.service';
import { VendorsService } from './vendors.service';
import { StaffingController } from './staffing.controller';
import { StaffingService } from './staffing.service';
import { StaffingBillingService } from './billing.service';
import { ClientPortalService } from './client-portal.service';
import { PublicClientPortalController, StaffingBillingController } from './billing.controller';
import { StaffingJobsService } from './staffing-jobs.service';
import { REDIS_CONNECTION, createRedisConnection } from '../jobs/redis-connection';

// Staffing desk (HIR-14 … 21, 30, 31, Settings 6.2). Slice 1: clients, contacts, rate cards, 6.2 settings and invoice
// series. Slices 2 (submissions, placements, bench, vendors) and 3 (invoices, receivables, fees, e-invoice) build on it.
@Module({
  imports: [AuthModule, OrgStructureModule, EmailModule, PipelineModule, AgencySubmissionsModule],
  controllers: [StaffingController, StaffingBillingController, PublicClientPortalController],
  providers: [{ provide: REDIS_CONNECTION, useFactory: createRedisConnection }, StaffingService, StaffingWorkService, VendorsService, StaffingBillingService, ClientPortalService, StaffingJobsService],
  exports: [StaffingService],
})
export class StaffingModule {}
