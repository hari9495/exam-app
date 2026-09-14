import { Module } from '@nestjs/common';
import { REDIS_CONNECTION, createRedisConnection } from '../jobs/redis-connection';
import { CandidateEmailsModule } from '../candidate-emails/candidate-emails.module';
import { CANDIDATE_EMAIL_BATCHES_QUEUE, createCandidateEmailBatchesQueue } from './candidate-email-batches.queue';
import { BulkCandidateEmailController } from './bulk-candidate-email.controller';
import { BulkCandidateEmailService } from './bulk-candidate-email.service';
import { CandidateEmailBatchWorkerService } from './candidate-email-batch.worker.service';

// Bulk email to selected candidates: enqueue a batch, loop the entries through the existing
// CandidateEmailsService.sendMessage in a background worker. Owns its own queue + worker (mirroring
// HrisModule) reusing the shared Redis-connection factory; imports CandidateEmailsModule for the
// send service. TenantPrismaService + AuditService are globally provided.
@Module({
  imports: [CandidateEmailsModule],
  controllers: [BulkCandidateEmailController],
  providers: [
    { provide: REDIS_CONNECTION, useFactory: createRedisConnection },
    { provide: CANDIDATE_EMAIL_BATCHES_QUEUE, useFactory: createCandidateEmailBatchesQueue, inject: [REDIS_CONNECTION] },
    BulkCandidateEmailService,
    CandidateEmailBatchWorkerService,
  ],
})
export class BulkCandidateEmailModule {}
