import { Module } from '@nestjs/common';
import { CryptoModule } from '@exam-platform/shared';
import { EmployeeHistoryModule } from '../employee-history/employee-history.module';
import { AuthModule } from '../auth/auth.module';
import { PeopleExtraController } from './people-extra.controller';
import { ComplianceController } from './compliance.controller';
import { RecordsService } from './records.service';
import { DisabilityService } from './disability.service';
import { MergeService } from './merge.service';
import { ComplianceService } from './compliance.service';

// People, the rest of the designed screens (founder decision 21 Oct 2026): identity checks, merge and unmerge, the
// disability declaration, work authorisations, international bank details, and BFSI declarations and pre-clearance.
@Module({
  imports: [EmployeeHistoryModule, CryptoModule, AuthModule],
  controllers: [PeopleExtraController, ComplianceController],
  providers: [RecordsService, DisabilityService, MergeService, ComplianceService],
})
export class PeopleExtraModule {}
