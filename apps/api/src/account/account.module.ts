import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { DocumentsModule } from '../documents/documents.module';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';

// Settings group 8 (S-9, answers 1328 and 1332): plan, usage and invoices read-only; the whole-company export and the
// closure request.
@Module({
  imports: [BillingModule, DocumentsModule],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}
