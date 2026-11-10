import { PayrollModule } from '../payroll/payroll.module';
import { ClraRegistersController } from './registers.controller';
import { ClraRegistersService } from './registers.service';
import { Inject, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { CryptoModule } from '@exam-platform/shared';
import { DocumentsModule } from '../documents/documents.module';
import { EmailModule } from '../email/email.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrgStructureModule } from '../org-structure/org-structure.module';
import { REDIS_CONNECTION, bullOpts, createRedisConnection, logBullErrors } from '../jobs/redis-connection';
import { ContractLabourController } from './contract-labour.controller';
import { ContractLabourService } from './contract-labour.service';
import { WorkersService } from './workers.service';
import { ContractAttendanceService } from './attendance.service';
import { ComplianceService } from './compliance.service';
import { StatutoryModule } from '../statutory/statutory.module';
import { ContractorPortalService } from './contractor-portal.service';
import { PublicContractorPortalController } from './contractor-portal.controller';

const QUEUE = 'clra-jobs';

/** Answers 627, 743: every morning at 08:30 India time, tell the compliance owners about licences reaching an alert day and new liability alerts. */
@Injectable()
export class ContractLabourJobs implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ContractLabourJobs.name);
  private readonly queue: Queue;
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: Redis,
    private readonly svc: ContractLabourService,
    private readonly attendance: ContractAttendanceService,
    private readonly compliance: ComplianceService,
  ) {
    this.queue = logBullErrors(new Queue(QUEUE, bullOpts(connection)), QUEUE);
  }

  async onModuleInit() {
    this.worker = logBullErrors(new Worker(QUEUE, () => this.run(), bullOpts(this.connection)), QUEUE);
    await this.queue.upsertJobScheduler('licence-alerts', { pattern: '30 8 * * *', tz: 'Asia/Kolkata' }, { name: 'alerts', data: {} });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue.close();
  }

  async run() {
    const n = await this.svc.alertAll().catch((e: Error) => (this.logger.warn(`licence alerts: ${e.message}`), 0));
    // Answer 622: each site's highest number of contract workers on any day of the last 12 months.
    await this.attendance.peaksAll().catch((e: Error) => this.logger.warn(`clra peaks: ${e.message}`));
    if (n) this.logger.log(`contractor licence alerts: ${n}`);
    // Answer 743: new liability alerts to the compliance owners, once per alert.
    const k = await this.compliance.noticeAll().catch((e: Error) => (this.logger.warn(`clra alert notices: ${e.message}`), 0));
    if (k) this.logger.log(`contract labour alerts noticed: ${k}`);
  }
}

// Contract labour CL-1: contractors (the vendor record), their licences and renewals, Settings 4.9, expiry alerts.
// CL-2: contract workers (persons with the contract_worker role) and their deployments, gate passes and inductions.
@Module({
  imports: [AuthModule, StatutoryModule, CryptoModule, DocumentsModule, EmailModule, NotificationsModule, OrgStructureModule, PayrollModule],
  controllers: [ContractLabourController, PublicContractorPortalController, ClraRegistersController],
  providers: [{ provide: REDIS_CONNECTION, useFactory: createRedisConnection }, ContractLabourService, WorkersService, ComplianceService, ContractAttendanceService, ContractorPortalService, ContractLabourJobs, ClraRegistersService],
  exports: [ContractLabourService, ContractAttendanceService],
})
export class ContractLabourModule {}
