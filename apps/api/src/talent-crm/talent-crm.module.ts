import { Module } from '@nestjs/common';
import { StorageModule } from '@exam-platform/shared';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { CampaignsService } from './campaigns.service';
import { CrmConsentsService } from './consents.service';
import { CrmController, CrmPublicController } from './crm.controller';

// HIR-20 Talent CRM campaigns and sourced profiles, HIR-05 guardian consent; the sweeps run in ScheduledSweepsModule.
@Module({
  imports: [AuthModule, EmailModule, WhatsappModule, StorageModule],
  controllers: [CrmController, CrmPublicController],
  providers: [CampaignsService, CrmConsentsService],
  exports: [CampaignsService, CrmConsentsService],
})
export class TalentCrmModule {}
