import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DocumentsModule } from '../documents/documents.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LibraryController } from './library.controller';
import { LibraryService } from './library.service';
import { CompanyDocsService } from './company-docs.service';

// G4: the report library (ANL-06) and company documents (item 21); the expiry reminders run on the scheduled sweeps.
@Module({
  imports: [AuthModule, DocumentsModule, NotificationsModule],
  controllers: [LibraryController],
  providers: [LibraryService, CompanyDocsService],
  exports: [CompanyDocsService],
})
export class LibraryModule {}
