import { Module } from '@nestjs/common';
import { CryptoModule } from '@exam-platform/shared';
import { DocumentsModule } from '../documents/documents.module';
import { EmailModule } from '../email/email.module';
import { REDIS_CONNECTION, createRedisConnection } from '../jobs/redis-connection';
import { NotificationsModule } from '../notifications/notifications.module';
import { PublicSpeakupController, SpeakupController } from './speakup.controller';
import { SpeakupService } from './speakup.service';

// HLP-06 speak-up filing: grievances, ethics concerns and POSH complaints, anonymous follow-up, the case officer lists.
@Module({
  imports: [CryptoModule, DocumentsModule, NotificationsModule, EmailModule],
  controllers: [SpeakupController, PublicSpeakupController],
  providers: [{ provide: REDIS_CONNECTION, useFactory: createRedisConnection }, SpeakupService],
  exports: [SpeakupService],
})
export class SpeakupModule {}
