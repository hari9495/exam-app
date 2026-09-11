import { Module } from '@nestjs/common';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { CandidateWhatsappController } from './candidate-whatsapp.controller';
import { CandidateWhatsappService } from './candidate-whatsapp.service';
import { CandidateWhatsappTemplatesController } from './candidate-whatsapp-templates.controller';
import { CandidateWhatsappTemplatesService } from './candidate-whatsapp-templates.service';

@Module({
  imports: [WhatsappModule],
  controllers: [CandidateWhatsappController, CandidateWhatsappTemplatesController],
  providers: [CandidateWhatsappService, CandidateWhatsappTemplatesService],
  exports: [CandidateWhatsappService, CandidateWhatsappTemplatesService],
})
export class CandidateWhatsappModule {}
