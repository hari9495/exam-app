import { Module } from '@nestjs/common';
import { StorageModule } from '@exam-platform/shared';
import { AuthModule } from '../auth/auth.module';
import { OrgStructureModule } from '../org-structure/org-structure.module';
import { DocumentsModule } from '../documents/documents.module';
import { EmailModule } from '../email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TimeModule } from '../time/time.module';
import { VisitorKioskController, WalkInsController } from './walkins.controller';
import { WalkInsService } from './walkins.service';
import { PublicVisitsController, VisitorWatchlistController, VisitorsController } from './visitors.controller';
import { VisitorWatchlistService } from './visitor-watchlist.service';
import { VisitorsService } from './visitors.service';

// Visitors (M02 §B11, VIS-01 … VIS-04, T9-14, Settings 3.12). Slice 1: invites, the visitor's pass page, the desk,
// the log, Settings 3.12, retention and the auto-close of forgotten check-outs. Slice 3: the watch-list (605), ID proof
// (603) and visitors under 18 (614).
@Module({
  imports: [AuthModule, OrgStructureModule, EmailModule, StorageModule, DocumentsModule, NotificationsModule, TimeModule],
  // Slice 2: walk-ins (desk and kiosk), the host's decision, visitor types. WalkInsController before VisitorsController
  // keeps its two-part paths (desk/hosts, desk/needs) ahead of the slice-1 routes.
  controllers: [WalkInsController, VisitorWatchlistController, VisitorsController, PublicVisitsController, VisitorKioskController],
  providers: [VisitorsService, VisitorWatchlistService, WalkInsService],
  exports: [VisitorsService, VisitorWatchlistService, WalkInsService],
})
export class VisitorsModule {}
