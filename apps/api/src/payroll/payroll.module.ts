import { Module } from '@nestjs/common';
import { AuditModule, CryptoModule, StorageModule } from '@exam-platform/shared';
import { REDIS_CONNECTION, createRedisConnection } from '../jobs/redis-connection';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailModule } from '../email/email.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { DSC_REVOCATION, DSC_ROOTS, OnlineRevocationChecker } from '../documents/signed-pdf';
import { PublishedCcaRoots } from '../documents/cca-roots.provider';
import { PayAuditService } from './audit.service';
import { PayDocumentsService } from './documents.service';
import { ExchangeFilesService } from './exchange-files.service';
import { PayFileStore } from './pay-file-store';
import { PayrollController, PublicPayController } from './payroll.controller';
import { Payroll5bController } from './payroll-5b.controller';
import { Payroll5cController } from './payroll-5c.controller';
import { Payroll5dController } from './payroll-5d.controller';
import { PayoutService } from './payout.service';
import { PayslipsService } from './payslips.service';
import { PayRunsService } from './runs.service';
import { PayInputsService } from './inputs.service';
import { PayImportsService } from './imports.service';
import { PaySetupService } from './setup.service';
import { PayStructuresService } from './structures.service';
import { EmployeeHistoryModule } from '../employee-history/employee-history.module';
import { PayrollJobs } from './payroll-jobs';
import { PayPeriodsService } from './periods.service';

// M03 payroll, batch 5a: locks, audit, documents and exchange files (PAY-1.01 … PAY-1.12); batch 5b: set-up,
// structures, compensation, statutory profiles and imports (PAY-2.04 … PAY-2.13); batch 5c: runs and inputs;
// batch 5d: pay-out and payslips (PAY-4.01 … PAY-4.06). Time imports it for the
// reopen request (the step-4 unlock became it) and nothing here depends on time's services.
@Module({
  imports: [AuditModule, CryptoModule, StorageModule, WorkflowModule, NotificationsModule, AuthModule, EmployeeHistoryModule],
  controllers: [PayrollController, PublicPayController, Payroll5bController, Payroll5cController, Payroll5dController],
  providers: [{ provide: REDIS_CONNECTION, useFactory: createRedisConnection }, { provide: DSC_ROOTS, useClass: PublishedCcaRoots }, { provide: DSC_REVOCATION, useClass: OnlineRevocationChecker }, PayFileStore, PayPeriodsService, PayAuditService, PayDocumentsService, ExchangeFilesService, PaySetupService, PayStructuresService, PayImportsService, PayRunsService, PayInputsService, PayoutService, PayslipsService, PayrollJobs],
  exports: [PayPeriodsService, PayDocumentsService, ExchangeFilesService],
})
export class PayrollModule {}
