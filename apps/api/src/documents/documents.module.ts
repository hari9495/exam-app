import { Module } from '@nestjs/common';
import { CryptoModule, StorageModule } from '@exam-platform/shared';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RulesEngineModule } from '../rules-engine/rules-engine.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { FileStore } from './file-store';
import { FilesService } from './files.service';
import { LettersController } from './letters/letters.controller';
import { LettersService } from './letters/letters.service';
import { DSC_REVOCATION, DSC_ROOTS, OnlineRevocationChecker, trustedRoots } from './signed-pdf';

// P05 shared pieces: the file store and pipeline, person documents (6a), letters and e-sign (6b). Payroll's documents
// keep their own table and reuse the store, the reference format, the verify page and the signing adapter (D10).
@Module({
  imports: [CryptoModule, StorageModule, NotificationsModule, WorkflowModule, RulesEngineModule, AuthModule],
  controllers: [DocumentsController, LettersController],
  providers: [{ provide: DSC_ROOTS, useFactory: trustedRoots }, { provide: DSC_REVOCATION, useClass: OnlineRevocationChecker }, FileStore, FilesService, DocumentsService, LettersService],
  exports: [FileStore, FilesService, DocumentsService, LettersService],
})
export class DocumentsModule {}
