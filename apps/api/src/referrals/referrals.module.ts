import { Module } from '@nestjs/common';
import { StorageModule } from '@exam-platform/shared';
import { JobsModule } from '../jobs/jobs.module';
import { PayrollModule } from '../payroll/payroll.module';
import { RulesEngineModule } from '../rules-engine/rules-engine.module';
import { ReferralsService } from './referrals.service';
import { ReferralsController } from './referrals.controller';

// Employee referral portal. Reuses the application-ingestion primitives (BlobStorage for the résumé,
// the jobs queue for résumé parsing, recomputeGlobalStage) to land a referral as a candidate +
// pipeline entry (enteredVia='referral'), then tracks the referral + its reward on the Referral row.
// TenantPrismaService + AuditService are globally provided.
@Module({
  imports: [StorageModule, JobsModule, PayrollModule, RulesEngineModule],
  controllers: [ReferralsController],
  providers: [ReferralsService],
})
export class ReferralsModule {}
