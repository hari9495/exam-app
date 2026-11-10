import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrgStructureModule } from '../org-structure/org-structure.module';
import { EmailModule } from '../email/email.module';
import { PublicVisitsController, VisitorsController } from './visitors.controller';
import { VisitorsService } from './visitors.service';

// Visitors (M02 §B11, VIS-01 … VIS-04, T9-14, Settings 3.12). Slice 1: invites, the visitor's pass page, the desk,
// the log, Settings 3.12, retention and the auto-close of forgotten check-outs.
@Module({
  imports: [AuthModule, OrgStructureModule, EmailModule],
  controllers: [VisitorsController, PublicVisitsController],
  providers: [VisitorsService],
  exports: [VisitorsService],
})
export class VisitorsModule {}
