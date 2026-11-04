import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PayrollModule } from '../payroll/payroll.module';
import { DisputesController } from './disputes.controller';
import { DisputesService } from './disputes.service';

// HLP-13 collective disputes: the IR team's record, conciliation, the two-person settlement sent to payroll arrears.
@Module({
  imports: [DocumentsModule, NotificationsModule, PayrollModule],
  controllers: [DisputesController],
  providers: [DisputesService],
})
export class DisputesModule {}
