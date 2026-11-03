import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SpeakupModule } from '../speakup/speakup.module';
import { CasesController, EthicsController, MyCasesController } from './cases.controller';
import { CasesService } from './cases.service';

// HLP-07 My cases, HLP-08 Cases (case team), HLP-09 Ethics desk on the HLP-06 case record.
@Module({
  imports: [DocumentsModule, NotificationsModule, SpeakupModule],
  controllers: [CasesController, EthicsController, MyCasesController],
  providers: [CasesService],
})
export class CasesModule {}
