import { Module } from '@nestjs/common';
import { CryptoModule } from '@exam-platform/shared';
import { BillingModule } from '../billing/billing.module';
import { JobsModule } from '../jobs/jobs.module';
import { CandidateSearchController } from './candidate-search.controller';
import { CandidateSearchService } from './candidate-search.service';

@Module({
  // CryptoModule -> EmbeddingResolverService; BillingModule -> QuotaService; JobsModule -> JobsService
  // (backfill enqueues candidate_embed). TenantPrismaService is global.
  imports: [CryptoModule, BillingModule, JobsModule],
  controllers: [CandidateSearchController],
  providers: [CandidateSearchService],
})
export class CandidateSearchModule {}
