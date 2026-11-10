import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { CampaignsService } from './campaigns.service';
import { CrmConsentsService } from './consents.service';
import { CrmController, CrmPublicController } from './crm.controller';

// HIR-20 Talent CRM campaigns and sourced profiles, HIR-05 guardian consent; the sweeps run in ScheduledSweepsModule.
@Module({
  imports: [AuthModule, EmailModule, WhatsappModule],
  controllers: [CrmController, CrmPublicController],
  providers: [CampaignsService, CrmConsentsService],
  exports: [CampaignsService, CrmConsentsService],
})
export class TalentCrmModule {}
