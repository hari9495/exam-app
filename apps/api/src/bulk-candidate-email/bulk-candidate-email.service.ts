import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { TenantPrismaService, TenantContext, AuditService } from '@exam-platform/shared';
import { CANDIDATE_EMAIL_BATCHES_QUEUE } from './candidate-email-batches.queue';
import { CandidateEmailBatchJobData } from './candidate-email-batch.worker.service';

const JOB_OPTS = { attempts: 1, removeOnComplete: 1000, removeOnFail: 1000 } as const;

export interface EnqueueInput {
  templateId?: string | null;
  subject: string;
  body: string;
  senderAddressId?: string;
}

export interface EnqueueResult {
  batchId: string;
  total: number;
  // candidate ids that had no pipeline entry to email against (by-candidates path only).
  unresolvedCandidateIds: string[];
}

@Injectable()
export class BulkCandidateEmailService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
    @Inject(CANDIDATE_EMAIL_BATCHES_QUEUE) private readonly queue: Queue,
  ) {}

  async sendToEntries(context: TenantContext, actorUserId: string | null, entryIds: string[], input: EnqueueInput): Promise<EnqueueResult> {
    return this.enqueue(context, actorUserId, entryIds, [], input);
  }

  async sendToCandidates(context: TenantContext, actorUserId: string | null, candidateIds: string[], input: EnqueueInput): Promise<EnqueueResult> {
    const orgId = context.organizationId as string;
    // Resolve each candidate to their most-recent pipeline entry -- sendMessage is entry-keyed
    // (renders {{jobTitle}} + the status link from the entry). A candidate with no entry can't be
    // emailed and is returned as unresolved.
    const entries = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.pipelineEntry.findMany({
        where: { candidateId: { in: candidateIds }, organizationId: orgId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, candidateId: true },
      }),
    );
    const entryByCandidate = new Map<string, string>();
    for (const e of entries) {
      if (!entryByCandidate.has(e.candidateId)) entryByCandidate.set(e.candidateId, e.id); // first = latest
    }
    const entryIds = candidateIds.map((id) => entryByCandidate.get(id)).filter((id): id is string => Boolean(id));
    const unresolvedCandidateIds = candidateIds.filter((id) => !entryByCandidate.has(id));
    return this.enqueue(context, actorUserId, entryIds, unresolvedCandidateIds, input);
  }

  async getBatch(context: TenantContext, batchId: string) {
    const batch = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.candidateEmailBatch.findFirst({ where: { id: batchId } }),
    );
    if (!batch) throw new NotFoundException(`Batch ${batchId} not found`);
    return batch;
  }

  private async enqueue(
    context: TenantContext,
    actorUserId: string | null,
    entryIds: string[],
    unresolvedCandidateIds: string[],
    input: EnqueueInput,
  ): Promise<EnqueueResult> {
    if (entryIds.length === 0) {
      throw new BadRequestException('No candidates with a pipeline entry to email');
    }
    const orgId = context.organizationId as string;

    const batch = await this.tenantPrisma.forTenant(context, async (tx) => {
      const row = await tx.candidateEmailBatch.create({
        data: {
          organizationId: orgId,
          createdByUserId: actorUserId,
          subject: input.subject,
          status: 'pending',
          total: entryIds.length,
        },
      });
      return row;
    });

    await this.audit.record(context, {
      actorUserId,
      action: 'candidate_email_batch.enqueued',
      entityType: 'candidate_email_batch',
      entityId: batch.id,
      metadata: { total: entryIds.length },
    });

    const jobData: CandidateEmailBatchJobData = {
      batchId: batch.id,
      organizationId: orgId,
      actorUserId,
      entryIds,
      templateId: input.templateId ?? null,
      subject: input.subject,
      body: input.body,
      ...(input.senderAddressId ? { senderAddressId: input.senderAddressId } : {}),
    };
    await this.queue.add('send', jobData, JOB_OPTS);

    return { batchId: batch.id, total: entryIds.length, unresolvedCandidateIds };
  }
}
