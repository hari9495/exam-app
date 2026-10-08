import { Module } from '@nestjs/common';
import { CryptoModule, StorageModule } from '@exam-platform/shared';
import { EmailService } from './email.service';
import { EmailLookService } from './email-look.service';

@Module({
  imports: [CryptoModule, StorageModule],
  providers: [EmailService, EmailLookService],
  exports: [EmailService, EmailLookService],
})
export class EmailModule {}
