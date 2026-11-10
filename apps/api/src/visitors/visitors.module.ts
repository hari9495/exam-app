import { Module } from '@nestjs/common';
import { StorageModule } from '@exam-platform/shared';
import { AuthModule } from '../auth/auth.module';
import { OrgStructureModule } from '../org-structure/org-structure.module';
import { EmailModule } from '../email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TimeModule } from '../time/time.module';
import { VisitorKioskController, WalkInsController } from './walkins.controller';
import { WalkInsService } from './walkins.service';
import { PublicVisitsController, VisitorsController } from './visitors.controller';
import { VisitorsService } from './visitors.service';

// Visitors (M02 §B11, VIS-01 … VIS-04, T9-14, Settings 3.12). Slice 1: invites, the visitor's pass page, the desk,
// the log, Settings 3.12, retention and the auto-close of forgotten check-outs.
@Module({
  imports: [AuthModule, OrgStructureModule, EmailModule, StorageModule, NotificationsModule, TimeModule],
  // Slice 2: walk-ins (desk and kiosk), the host's decision, visitor types. WalkInsController before VisitorsController
  // keeps its two-part paths (desk/hosts, desk/needs) ahead of the slice-1 routes.
  controllers: [WalkInsController, VisitorsController, PublicVisitsController, VisitorKioskController],
  providers: [VisitorsService, WalkInsService],
  exports: [VisitorsService, WalkInsService],
})
export class VisitorsModule {}
