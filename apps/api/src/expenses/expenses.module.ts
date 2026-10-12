import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ExpensesController } from './expenses.controller';
import { ExpenseSetupService } from './setup.service';

// M05 expenses, advances and travel (M05-BUILD-DESIGN §4). Batch E1: set-up and policies.
@Module({
  imports: [AuthModule],
  controllers: [ExpensesController],
  providers: [ExpenseSetupService],
  exports: [ExpenseSetupService],
})
export class ExpensesModule {}
