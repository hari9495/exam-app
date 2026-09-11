import { Module } from '@nestjs/common';
import { CryptoModule } from '@exam-platform/shared';
import { SmsService } from './sms.service';

@Module({
  imports: [CryptoModule],
  providers: [SmsService],
  exports: [SmsService],
})
export class SmsModule {}
