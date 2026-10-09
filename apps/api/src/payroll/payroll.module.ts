import { Module } from '@nestjs/common';
import { AuditModule, CryptoModule, StorageModule } from '@exam-platform/shared';
import { REDIS_CONNECTION, createRedisConnection } from '../jobs/redis-connection';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { PayAuditService } from './audit.service';
import { PayDocumentsService } from './documents.service';
import { ExchangeFilesService } from './exchange-files.service';
import { PayFileStore } from './pay-file-store';
import { PayrollController, PublicPayController } from './payroll.controller';
import { PayrollJobs } from './payroll-jobs';
import { PayPeriodsService } from './periods.service';

// M03 payroll, batch 5a: locks, audit, documents and exchange files (PAY-1.01 … PAY-1.12). Time imports it for the
// reopen request (the step-4 unlock became it) and nothing here depends on time's services.
@Module({
  imports: [AuditModule, CryptoModule, StorageModule, WorkflowModule, NotificationsModule, AuthModule],
  controllers: [PayrollController, PublicPayController],
  providers: [{ provide: REDIS_CONNECTION, useFactory: createRedisConnection }, PayFileStore, PayPeriodsService, PayAuditService, PayDocumentsService, ExchangeFilesService, PayrollJobs],
  exports: [PayPeriodsService, PayDocumentsService, ExchangeFilesService],
})
export class PayrollModule {}
