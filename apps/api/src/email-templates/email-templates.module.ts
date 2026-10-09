import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { EmailTemplatesController } from './email-templates.controller';
import { EmailTemplatesService } from './email-templates.service';

// P04 Q5: companies brand and re-word the account emails (Settings › Notifications › Email).
@Module({
  imports: [EmailModule],
  providers: [EmailTemplatesService],
  controllers: [EmailTemplatesController],
})
export class EmailTemplatesModule {}
