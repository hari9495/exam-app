import { Module } from '@nestjs/common';
import { SmsModule } from '../sms/sms.module';
import { CandidateSmsController } from './candidate-sms.controller';
import { CandidateSmsService } from './candidate-sms.service';

@Module({
  imports: [SmsModule],
  controllers: [CandidateSmsController],
  providers: [CandidateSmsService],
  exports: [CandidateSmsService],
})
export class CandidateSmsModule {}
