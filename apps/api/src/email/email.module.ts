import { Module } from '@nestjs/common';
import { CryptoModule } from '@exam-platform/shared';
import { EmailService } from './email.service';

@Module({
  imports: [CryptoModule],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
