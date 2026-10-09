import { Module } from '@nestjs/common';
import { CryptoModule, StorageModule } from '@exam-platform/shared';
import { NotificationsModule } from '../notifications/notifications.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { FileStore } from './file-store';
import { FilesService } from './files.service';

// P05 shared pieces (lifecycle 6a, LIFE-1.02 / 1.03): the file store and pipeline, person documents. Payroll's
// documents, numbers and verify page (5a) stay in payroll/ and use the same file store (D10).
@Module({
  imports: [CryptoModule, StorageModule, NotificationsModule],
  controllers: [DocumentsController],
  providers: [FileStore, FilesService, DocumentsService],
  exports: [FileStore, FilesService, DocumentsService],
})
export class DocumentsModule {}
