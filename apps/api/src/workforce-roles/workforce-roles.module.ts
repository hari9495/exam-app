import { Module } from '@nestjs/common';
import { CryptoModule } from '@exam-platform/shared';
import { WorkforceRolesController } from './workforce-roles.controller';
import { WorkforceRolesService } from './workforce-roles.service';
import { ContractComplianceController } from './contract-compliance.controller';
import { ContractComplianceService } from './contract-compliance.service';

// Contract workers and placements: roles on the person record that the People Directory counts.
// Part 2: vendor compliance, CLRA registers and returns, reports and workers' identifiers.
@Module({
  imports: [CryptoModule],
  providers: [WorkforceRolesService, ContractComplianceService],
  controllers: [WorkforceRolesController, ContractComplianceController],
  exports: [WorkforceRolesService],
})
export class WorkforceRolesModule {}
