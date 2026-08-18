import { Module } from '@nestjs/common';
import { StorageModule } from '@exam-platform/shared';
import { EmailModule } from '../email/email.module';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';
import { OfferTemplatesService } from './offer-templates.service';

@Module({
  imports: [EmailModule, StorageModule],
  controllers: [OffersController],
  providers: [OffersService, OfferTemplatesService],
  exports: [OffersService],
})
export class OffersModule {}
