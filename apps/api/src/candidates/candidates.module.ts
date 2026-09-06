import { Module } from '@nestjs/common';
import { StorageModule } from '@exam-platform/shared';
import { CandidatesController } from './candidates.controller';
import { CandidatesService } from './candidates.service';
import { BillingModule } from '../billing/billing.module';
import { FieldPermissionsModule } from '../field-permissions/field-permissions.module';

@Module({
  // BillingModule/FieldPermissionsModule imported explicitly (not @Global) so CandidatesService
  // can inject QuotaService/FieldPermissionsService -- same prod DI crash this pattern avoids
  // elsewhere (see users.module.ts).
  imports: [StorageModule, BillingModule, FieldPermissionsModule],
  controllers: [CandidatesController],
  providers: [CandidatesService],
  exports: [CandidatesService],
})
export class CandidatesModule {}
