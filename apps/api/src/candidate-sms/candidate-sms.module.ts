import { Module } from '@nestjs/common';
import { SmsModule } from '../sms/sms.module';
import { CandidateSmsController } from './candidate-sms.controller';
import { CandidateSmsService } from './candidate-sms.service';
import { CandidateSmsTemplatesController } from './candidate-sms-templates.controller';
import { CandidateSmsTemplatesService } from './candidate-sms-templates.service';

@Module({
  imports: [SmsModule],
  controllers: [CandidateSmsController, CandidateSmsTemplatesController],
  providers: [CandidateSmsService, CandidateSmsTemplatesService],
  exports: [CandidateSmsService, CandidateSmsTemplatesService],
})
export class CandidateSmsModule {}
