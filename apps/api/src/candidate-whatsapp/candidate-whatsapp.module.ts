import { Module } from '@nestjs/common';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { CandidateWhatsappController } from './candidate-whatsapp.controller';
import { CandidateWhatsappService } from './candidate-whatsapp.service';

@Module({
  imports: [WhatsappModule],
  controllers: [CandidateWhatsappController],
  providers: [CandidateWhatsappService],
  exports: [CandidateWhatsappService],
})
export class CandidateWhatsappModule {}
