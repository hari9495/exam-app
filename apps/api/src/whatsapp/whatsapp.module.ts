import { Module } from '@nestjs/common';
import { CryptoModule } from '@exam-platform/shared';
import { WhatsappService } from './whatsapp.service';

@Module({
  imports: [CryptoModule],
  providers: [WhatsappService],
  exports: [WhatsappService],
})
export class WhatsappModule {}
