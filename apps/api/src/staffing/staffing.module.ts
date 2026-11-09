import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrgStructureModule } from '../org-structure/org-structure.module';
import { StaffingController } from './staffing.controller';
import { StaffingService } from './staffing.service';

// Staffing desk (HIR-14 … 21, 30, 31, Settings 6.2). Slice 1: clients, contacts, rate cards, 6.2 settings and invoice
// series. Slices 2 (submissions, placements, bench, vendors) and 3 (invoices, receivables, fees, e-invoice) build on it.
@Module({
  imports: [AuthModule, OrgStructureModule],
  controllers: [StaffingController],
  providers: [StaffingService],
  exports: [StaffingService],
})
export class StaffingModule {}
