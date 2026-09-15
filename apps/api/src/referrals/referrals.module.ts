import { Module } from '@nestjs/common';
import { StorageModule } from '@exam-platform/shared';
import { JobsModule } from '../jobs/jobs.module';
import { ReferralsService } from './referrals.service';
import { ReferralsController } from './referrals.controller';

// Employee referral portal. Reuses the application-ingestion primitives (BlobStorage for the résumé,
// the jobs queue for résumé parsing, recomputeGlobalStage) to land a referral as a candidate +
// pipeline entry (enteredVia='referral'), then tracks the referral + its reward on the Referral row.
// TenantPrismaService + AuditService are globally provided.
@Module({
  imports: [StorageModule, JobsModule],
  controllers: [ReferralsController],
  providers: [ReferralsService],
})
export class ReferralsModule {}
