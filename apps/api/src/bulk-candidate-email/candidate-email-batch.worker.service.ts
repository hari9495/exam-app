import { ConflictException, Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import Redis from 'ioredis';
import { TenantPrismaService } from '@exam-platform/shared';
import { REDIS_CONNECTION } from '../jobs/redis-connection';
import { CandidateEmailsService } from '../candidate-emails/candidate-emails.service';
import { CANDIDATE_EMAIL_BATCHES_QUEUE_NAME } from './candidate-email-batches.queue';

export interface CandidateEmailBatchJobData {
  batchId: string;
  organizationId: string;
  actorUserId: string | null;
  entryIds: string[];
  templateId: string | null;
  subject: string;
  body: string;
  senderAddressId?: string;
}

interface Tally {
  sent: number;
  skipped: number;
  failed: number;
}

@Injectable()
export class CandidateEmailBatchWorkerService implements OnModuleDestroy {
  private readonly logger = new Logger(CandidateEmailBatchWorkerService.name);
  private readonly worker: Worker;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: Redis,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly candidateEmails: CandidateEmailsService,
  ) {
    this.worker = new Worker(CANDIDATE_EMAIL_BATCHES_QUEUE_NAME, (job) => this.handle(job), { connection: this.connection });
    this.worker.on('failed', (job, err) => {
      this.logger.error(`candidate-email batch job ${job?.id} failed: ${err?.message}`, err as Error);
    });
  }

  // Public + separated from the Worker wiring so the spec can drive it without Redis.
  async run(data: CandidateEmailBatchJobData): Promise<Tally> {
    // Per-tenant context (not super-admin): CandidateEmailsService.sendMessage is RLS-scoped by org,
    // and the batch row is org-owned.
    const context = { organizationId: data.organizationId, isSuperAdmin: false };
    const tally: Tally = { sent: 0, skipped: 0, failed: 0 };

    await this.setStatus(context, data.batchId, 'processing', tally);

    for (const entryId of data.entryIds) {
      try {
        const row = await this.candidateEmails.sendMessage(context, data.actorUserId, entryId, {
          templateId: data.templateId,
          subject: data.subject,
          body: data.body,
          source: 'manual',
          ...(data.senderAddressId ? { senderAddressId: data.senderAddressId } : {}),
        });
        // sendMessage returns the candidate_emails row (status 'sent'|'failed') or null (opted-out is
        // a ConflictException on the manual path, caught below; null is only the triggered-skip path).
        if (!row) tally.skipped += 1;
        else if (row.status === 'sent') tally.sent += 1;
        else tally.failed += 1;
      } catch (err) {
        // Opted-out candidates raise ConflictException on the manual path -> skipped, not failed.
        if (err instanceof ConflictException) tally.skipped += 1;
        else {
          tally.failed += 1;
          this.logger.warn(`bulk email: entry ${entryId} failed: ${(err as Error).message}`);
        }
      }
      // Write the running tally after each send so the web poll shows live progress.
      await this.setStatus(context, data.batchId, 'processing', tally);
    }

    await this.setStatus(context, data.batchId, 'completed', tally);
    return tally;
  }

  private async handle(job: Job<CandidateEmailBatchJobData>): Promise<void> {
    await this.run(job.data);
  }

  private async setStatus(
    context: { organizationId: string; isSuperAdmin: boolean },
    batchId: string,
    status: 'processing' | 'completed',
    tally: Tally,
  ): Promise<void> {
    await this.tenantPrisma.forTenant(context, (tx) =>
      tx.candidateEmailBatch.update({
        where: { id: batchId },
        data: { status, sent: tally.sent, skipped: tally.skipped, failed: tally.failed },
      }),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
  }
}
