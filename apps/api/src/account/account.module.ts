import { Module } from '@nestjs/common';
import { CryptoModule } from '@exam-platform/shared';
import { NotificationsModule } from '../notifications/notifications.module';
import { BillingModule } from '../billing/billing.module';
import { DocumentsModule } from '../documents/documents.module';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { ExportStorageService } from './export-storage.service';
import { ScheduledExportService } from './scheduled-export.service';

// Settings group 8 (S-9, answers 1328 and 1332): plan, usage and invoices read-only; the whole-company export and the
// closure request; T2-G 45 the scheduled export to the company's own storage.
@Module({
  imports: [BillingModule, DocumentsModule, CryptoModule, NotificationsModule],
  controllers: [AccountController],
  providers: [AccountService, ExportStorageService, ScheduledExportService],
  // T2-G 45: the daily sweep sends the scheduled exports.
  exports: [ScheduledExportService],
})
export class AccountModule {}
