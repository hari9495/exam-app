import { Module } from '@nestjs/common';
import { StorageModule } from '@exam-platform/shared';
import { EmailModule } from '../email/email.module';
import { CandidateEmailTemplatesController } from './candidate-email-templates.controller';
import { CandidateEmailTemplatesService } from './candidate-email-templates.service';
import { CandidateEmailsController } from './candidate-emails.controller';
import { CandidateEmailsService } from './candidate-emails.service';

@Module({
  imports: [EmailModule, StorageModule],
  controllers: [CandidateEmailTemplatesController, CandidateEmailsController],
  providers: [CandidateEmailsService, CandidateEmailTemplatesService],
  exports: [CandidateEmailsService, CandidateEmailTemplatesService],
})
export class CandidateEmailsModule {}
