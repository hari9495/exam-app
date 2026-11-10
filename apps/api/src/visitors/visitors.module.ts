import { Module } from '@nestjs/common';
import { StorageModule } from '@exam-platform/shared';
import { AuthModule } from '../auth/auth.module';
import { OrgStructureModule } from '../org-structure/org-structure.module';
import { DocumentsModule } from '../documents/documents.module';
import { EmailModule } from '../email/email.module';
import { PublicVisitsController, VisitorWatchlistController, VisitorsController } from './visitors.controller';
import { VisitorWatchlistService } from './visitor-watchlist.service';
import { VisitorsService } from './visitors.service';

// Visitors (M02 §B11, VIS-01 … VIS-04, T9-14, Settings 3.12). Slice 1: invites, the visitor's pass page, the desk,
// the log, Settings 3.12, retention and the auto-close of forgotten check-outs. Slice 3: the watch-list (605), ID proof
// (603) and visitors under 18 (614).
@Module({
  imports: [AuthModule, OrgStructureModule, EmailModule, StorageModule, DocumentsModule],
  controllers: [VisitorWatchlistController, VisitorsController, PublicVisitsController],
  providers: [VisitorsService, VisitorWatchlistService],
  exports: [VisitorsService, VisitorWatchlistService],
})
export class VisitorsModule {}
