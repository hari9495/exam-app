import { Module } from '@nestjs/common';
import { InvitationsModule } from '../../invitations/invitations.module';
import { DeliveryController } from './delivery.controller';
import { DeliveryService } from './delivery.service';

// Assessments AS-3 (PRC-07): invitations and drives, the staff side.
@Module({
  imports: [InvitationsModule],
  controllers: [DeliveryController],
  providers: [DeliveryService],
})
export class AsmtDeliveryModule {}
