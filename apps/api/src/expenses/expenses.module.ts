import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DocumentsModule } from '../documents/documents.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { ExpenseClaimsController } from './claims.controller';
import { ExpenseClaimsService } from './claims.service';
import { ExpensesController } from './expenses.controller';
import { RECEIPT_READER, readerFromEnv } from './ocr';
import { ExpenseSetupService } from './setup.service';

// M05 expenses, advances and travel (M05-BUILD-DESIGN §4). E1: set-up and policies. E2: claims, receipts (OCR seam,
// EXPENSE_OCR_ADAPTER), approvals and checks.
@Module({
  imports: [AuthModule, DocumentsModule, WorkflowModule],
  controllers: [ExpensesController, ExpenseClaimsController],
  providers: [ExpenseSetupService, ExpenseClaimsService, { provide: RECEIPT_READER, useFactory: () => readerFromEnv() }],
  exports: [ExpenseSetupService, ExpenseClaimsService],
})
export class ExpensesModule {}
