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
import { TaxController } from './tax.controller';
import { TaxService } from './tax.service';
import { LedgerService } from './ledger.service';
import { StatutoryController } from './statutory.controller';
import { StatutoryFilingsService } from './statutory-filings.service';
import { StatutoryRegistersService } from './statutory-registers.service';
import { FvuRunner } from '../statutory/fvu';
import { PayRunsService } from './runs.service';
import { PayInputsService } from './inputs.service';
import { PayImportsService } from './imports.service';
import { PaySetupService } from './setup.service';
import { PayStructuresService } from './structures.service';
import { EmployeeHistoryModule } from '../employee-history/employee-history.module';
import { PayrollJobs } from './payroll-jobs';
import { RulesEngineModule } from '../rules-engine/rules-engine.module';
import { Payroll5gController } from './payroll-5g.controller';
import { ArrearsService } from './arrears.service';
import { FnfService } from './fnf.service';
import { Payroll5jController } from './payroll-5j.controller';
import { GoLiveService } from './golive.service';
import { PayrollIntakeService } from './intake.service';
import { PayPeriodsService } from './periods.service';
import { ConsultantsService } from './consultants.service';
import { Payroll5hController, PublicConsultantController } from './payroll-5h.controller';

// M03 payroll, batch 5a: locks, audit, documents and exchange files (PAY-1.01 … PAY-1.12); batch 5b: set-up,
// structures, compensation, statutory profiles and imports (PAY-2.04 … PAY-2.13); batch 5c: runs and inputs;
// batch 5d: pay-out and payslips (PAY-4.01 … PAY-4.06); batch 5e: income tax (PAY-5.01 … PAY-5.08); batch 5f: statutory files, returns, registers (PAY-6.01 … PAY-6.10); batch 5g: off-cycle, arrears, F&F (PAY-7.01 … PAY-7.07); batch 5h: consultants (PAY-8.01 … PAY-8.04). Time imports it for the
// reopen request (the step-4 unlock became it) and nothing here depends on time's services.
@Module({
  imports: [AuditModule, CryptoModule, StorageModule, WorkflowModule, NotificationsModule, EmailModule, AuthModule, EmployeeHistoryModule, RulesEngineModule],
  controllers: [PayrollController, PublicPayController, Payroll5bController, Payroll5cController, Payroll5dController, TaxController, StatutoryController, Payroll5gController, Payroll5jController, Payroll5hController, PublicConsultantController],
  providers: [{ provide: REDIS_CONNECTION, useFactory: createRedisConnection }, { provide: DSC_ROOTS, useClass: PublishedCcaRoots }, { provide: DSC_REVOCATION, useClass: OnlineRevocationChecker }, PayFileStore, PayPeriodsService, PayAuditService, PayDocumentsService, ExchangeFilesService, PaySetupService, PayStructuresService, PayImportsService, PayRunsService, PayInputsService, PayoutService, PayslipsService, TaxService, LedgerService, StatutoryFilingsService, StatutoryRegistersService, FvuRunner, ArrearsService, FnfService, GoLiveService, PayrollIntakeService, PayrollJobs, ConsultantsService],
  exports: [PayPeriodsService, PayDocumentsService, ExchangeFilesService, PayrollIntakeService],
})
export class PayrollModule {}
