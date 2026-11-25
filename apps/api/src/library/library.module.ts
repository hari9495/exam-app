import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DocumentsModule } from '../documents/documents.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailModule } from '../email/email.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { LearningModule } from '../learning/learning.module';
import { ExportLogService, ReportSchedulesService } from './report-schedules.service';
import { LibraryController } from './library.controller';
import { LibraryService } from './library.service';
import { CompanyDocsService } from './company-docs.service';

// G4: the report library (ANL-06) and company documents (item 21); the expiry reminders run on the scheduled sweeps.
@Module({
  imports: [AuthModule, DocumentsModule, NotificationsModule, EmailModule, ExpensesModule, LearningModule],
  controllers: [LibraryController],
  providers: [LibraryService, CompanyDocsService, ReportSchedulesService, ExportLogService],
  exports: [CompanyDocsService, ReportSchedulesService],
})
export class LibraryModule {}
