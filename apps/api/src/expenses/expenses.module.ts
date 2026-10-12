import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DocumentsModule } from '../documents/documents.module';
import { REDIS_CONNECTION, createRedisConnection } from '../jobs/redis-connection';
import { NotificationsModule } from '../notifications/notifications.module';
import { PayrollModule } from '../payroll/payroll.module';
import { RulesEngineModule } from '../rules-engine/rules-engine.module';
import { CryptoModule } from '@exam-platform/shared';
import { WorkflowModule } from '../workflow/workflow.module';
import { ExpenseClaimsController } from './claims.controller';
import { ExpenseClaimsService } from './claims.service';
import { ExpensesController } from './expenses.controller';
import { ExpensesJobs } from './expenses-jobs';
import { ExpenseReportsController } from './reports.controller';
import { ExpenseReportsService } from './reports.service';
import { RECEIPT_READER, readerFromEnv } from './ocr';
import { ExpenseSetupService } from './setup.service';
import { ExpensePaymentsController } from './payments.controller';
import { ExpensePaymentsService } from './payments.service';
import { TRAVEL_BOOKING, travelPartnerFromEnv } from './travel';
import { ExpenseTripsController } from './trips.controller';
import { ExpenseTripsService } from './trips.service';

// M05 expenses, advances and travel (M05-BUILD-DESIGN §4). E1: set-up and policies. E2: claims, receipts (OCR seam,
// EXPENSE_OCR_ADAPTER), approvals and checks. E4: trips, bookings (partner seam, TRAVEL_BOOKING_ADAPTER) and advances.
// E5: exchange rates (company table), forex lines and advances, field-day drafts, look-alike photos, reports.
// E3: paying approved claims through payroll (the payroll hooks) or a bank file, the payroll events, and the journal.
@Module({
  imports: [AuthModule, DocumentsModule, WorkflowModule, NotificationsModule, PayrollModule, RulesEngineModule, CryptoModule],
  controllers: [ExpensesController, ExpenseClaimsController, ExpenseTripsController, ExpenseReportsController, ExpensePaymentsController],
  providers: [
    { provide: REDIS_CONNECTION, useFactory: createRedisConnection },
    ExpenseSetupService,
    ExpenseClaimsService,
    ExpenseTripsService,
    ExpenseReportsService,
    ExpensePaymentsService,
    ExpensesJobs,
    { provide: RECEIPT_READER, useFactory: () => readerFromEnv() },
    { provide: TRAVEL_BOOKING, useFactory: () => travelPartnerFromEnv() },
  ],
  exports: [ExpenseSetupService, ExpenseClaimsService, ExpenseTripsService],
})
export class ExpensesModule {}
