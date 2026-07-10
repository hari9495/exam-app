import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AiJob } from '@prisma/client';
import { Queue } from 'bullmq';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AI_JOBS_QUEUE } from './ai-jobs.queue';

export interface AiJobStatus {
  id: string;
  type: string;
  status: string;
  outputJson: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class JobsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    @Inject(AI_JOBS_QUEUE) private readonly queue: Queue,
  ) {}

  async enqueue(context: TenantContext, type: string, inputJson: string, userId: string): Promise<AiJob> {
    const aiJob = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.aiJob.create({
        data: {
          organizationId: context.organizationId as string,
          type,
          inputJson,
          createdBy: userId,
        },
      }),
    );

    await this.queue.add(
      type,
      { aiJobId: aiJob.id, organizationId: context.organizationId as string, type },
      { attempts: 1 },
    );

    return aiJob;
  }

  async getById(context: TenantContext, id: string): Promise<AiJobStatus> {
    const aiJob = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.aiJob.findFirst({ where: { id, organizationId: context.organizationId as string } }),
    );
    if (!aiJob) {
      throw new NotFoundException(`AI job ${id} not found`);
    }
    return {
      id: aiJob.id,
      type: aiJob.type,
      status: aiJob.status,
      outputJson: aiJob.outputJson,
      error: aiJob.error,
      createdAt: aiJob.createdAt,
      updatedAt: aiJob.updatedAt,
    };
  }
}
