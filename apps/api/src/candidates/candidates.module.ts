import { Module } from '@nestjs/common';
import { StorageModule } from '@exam-platform/shared';
import { CandidatesController } from './candidates.controller';
import { CandidatesService } from './candidates.service';
import { BillingModule } from '../billing/billing.module';

@Module({
  // BillingModule imported explicitly (not @Global) so CandidatesService can inject
  // QuotaService -- same prod DI crash this pattern avoids elsewhere (see users.module.ts).
  imports: [StorageModule, BillingModule],
  controllers: [CandidatesController],
  providers: [CandidatesService],
  exports: [CandidatesService],
})
export class CandidatesModule {}
