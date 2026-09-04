import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Pipeline, PipelineStage, PipelineStatus } from '@prisma/client';
import { TenantContext, TenantPrismaService, AuditService, STAGE_CATEGORIES, StageCategory } from '@exam-platform/shared';
import { CreatePipelineDto } from './dto/create-pipeline.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { UpdateStatusDto } from './dto/update-status.dto';

export type PipelineWithStages = Pipeline & { stages: (PipelineStage & { statuses: PipelineStatus[] })[] };

// Not brief-requested dto files (Task 5 owns request validation) -- plain shapes for the
// service's own create methods, where all fields are mandatory (unlike the *update* dtos).
export interface CreateStageInput {
  name: string;
  category: string;
  position: number;
}

export interface CreateStatusInput {
  name: string;
  position: number;
}

const STAGE_INCLUDE = { stages: { orderBy: { position: 'asc' as const }, include: { statuses: { orderBy: { position: 'asc' as const } } } } };

@Injectable()
export class PipelinesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  async listPipelines(context: TenantContext): Promise<PipelineWithStages[]> {
    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.pipeline.findMany({ where: { organizationId: context.organizationId as string }, include: STAGE_INCLUDE }),
    ) as Promise<PipelineWithStages[]>;
  }

  async getDefaultPipeline(context: TenantContext): Promise<PipelineWithStages> {
    const pipeline = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.pipeline.findFirst({ where: { organizationId: context.organizationId as string, isDefault: true }, include: STAGE_INCLUDE }),
    );
    if (!pipeline) throw new NotFoundException('Default pipeline not found');
    return pipeline as PipelineWithStages;
  }

  async createPipeline(context: TenantContext, actorUserId: string, dto: CreatePipelineDto): Promise<Pipeline> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const organizationId = context.organizationId as string;
      const created = await tx.pipeline.create({ data: { organizationId, name: dto.name, isDefault: false } });

      const defaultPipeline = await tx.pipeline.findFirst({
        where: { organizationId, isDefault: true },
        include: STAGE_INCLUDE,
      });
      if (!defaultPipeline) throw new NotFoundException('Default pipeline not found');

      for (const stage of (defaultPipeline as PipelineWithStages).stages) {
        const newStage = await tx.pipelineStage.create({
          data: { organizationId, pipelineId: created.id, name: stage.name, category: stage.category, position: stage.position },
        });
        for (const status of stage.statuses) {
          await tx.pipelineStatus.create({
            data: { organizationId, stageId: newStage.id, name: status.name, position: status.position },
          });
        }
      }

      await this.audit.record(context, {
        actorUserId,
        action: 'pipeline.created',
        entityType: 'pipeline',
        entityId: created.id,
        metadata: { name: created.name },
      });

      return created;
    });
  }

  async deletePipeline(context: TenantContext, actorUserId: string, pipelineId: string): Promise<void> {
    await this.tenantPrisma.forTenant(context, async (tx) => {
      const pipeline = await tx.pipeline.findFirst({ where: { id: pipelineId, organizationId: context.organizationId as string } });
      if (!pipeline) throw new NotFoundException('Pipeline not found');
      if (pipeline.isDefault) throw new BadRequestException('Cannot delete the default pipeline');

      await tx.pipeline.delete({ where: { id: pipelineId } });

      await this.audit.record(context, {
        actorUserId,
        action: 'pipeline.deleted',
        entityType: 'pipeline',
        entityId: pipelineId,
      });
    });
  }

  async createStage(context: TenantContext, actorUserId: string, pipelineId: string, input: CreateStageInput): Promise<PipelineStage> {
    this.assertValidCategory(input.category);

    return this.tenantPrisma.forTenant(context, async (tx) => {
      const stage = await tx.pipelineStage.create({
        data: {
          organizationId: context.organizationId as string,
          pipelineId,
          name: input.name,
          category: input.category,
          position: input.position,
        },
      });

      await this.audit.record(context, {
        actorUserId,
        action: 'pipeline.stage_created',
        entityType: 'pipeline_stage',
        entityId: stage.id,
        metadata: { pipelineId, category: input.category },
      });

      return stage;
    });
  }

  async updateStage(context: TenantContext, actorUserId: string, stageId: string, dto: UpdateStageDto): Promise<PipelineStage> {
    if (dto.category !== undefined) this.assertValidCategory(dto.category);

    return this.tenantPrisma.forTenant(context, async (tx) => {
      const organizationId = context.organizationId as string;
      const existing = await tx.pipelineStage.findFirst({ where: { id: stageId, organizationId } });
      if (!existing) throw new NotFoundException('Stage not found');

      const updated = await tx.pipelineStage.update({
        where: { id: stageId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.category !== undefined ? { category: dto.category } : {}),
          ...(dto.position !== undefined ? { position: dto.position } : {}),
        },
      });

      await this.audit.record(context, {
        actorUserId,
        action: 'pipeline.stage_updated',
        entityType: 'pipeline_stage',
        entityId: stageId,
      });

      return updated;
    });
  }

  async deleteStage(context: TenantContext, actorUserId: string, stageId: string): Promise<void> {
    await this.tenantPrisma.forTenant(context, async (tx) => {
      const organizationId = context.organizationId as string;
      const stage = await tx.pipelineStage.findFirst({ where: { id: stageId, organizationId } });
      if (!stage) throw new NotFoundException('Stage not found');

      const entryCount = await tx.pipelineEntry.count({ where: { status: { stageId } } });
      if (entryCount > 0) throw new ConflictException('Stage still has entries in it');

      if (stage.category === 'hired' || stage.category === 'rejected') {
        const siblings = await tx.pipelineStage.findMany({
          where: { pipelineId: stage.pipelineId, id: { not: stageId } },
        });
        const hasSiblingWithSameCategory = siblings.some((s: { category: string }) => s.category === stage.category);
        if (!hasSiblingWithSameCategory) {
          throw new BadRequestException(`Cannot remove the last '${stage.category}' stage of this pipeline`);
        }
      }

      await tx.pipelineStage.delete({ where: { id: stageId } });

      await this.audit.record(context, {
        actorUserId,
        action: 'pipeline.stage_deleted',
        entityType: 'pipeline_stage',
        entityId: stageId,
      });
    });
  }

  async createStatus(context: TenantContext, actorUserId: string, stageId: string, input: CreateStatusInput): Promise<PipelineStatus> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const status = await tx.pipelineStatus.create({
        data: { organizationId: context.organizationId as string, stageId, name: input.name, position: input.position },
      });

      await this.audit.record(context, {
        actorUserId,
        action: 'pipeline.status_created',
        entityType: 'pipeline_status',
        entityId: status.id,
        metadata: { stageId },
      });

      return status;
    });
  }

  async updateStatus(context: TenantContext, actorUserId: string, statusId: string, dto: UpdateStatusDto): Promise<PipelineStatus> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const organizationId = context.organizationId as string;
      const existing = await tx.pipelineStatus.findFirst({ where: { id: statusId, organizationId } });
      if (!existing) throw new NotFoundException('Status not found');

      const updated = await tx.pipelineStatus.update({
        where: { id: statusId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.position !== undefined ? { position: dto.position } : {}),
        },
      });

      await this.audit.record(context, {
        actorUserId,
        action: 'pipeline.status_updated',
        entityType: 'pipeline_status',
        entityId: statusId,
      });

      return updated;
    });
  }

  async deleteStatus(context: TenantContext, actorUserId: string, statusId: string): Promise<void> {
    await this.tenantPrisma.forTenant(context, async (tx) => {
      const organizationId = context.organizationId as string;
      const status = await tx.pipelineStatus.findFirst({ where: { id: statusId, organizationId } });
      if (!status) throw new NotFoundException('Status not found');

      const entryCount = await tx.pipelineEntry.count({ where: { statusId } });
      if (entryCount > 0) throw new ConflictException('Status still has entries in it');

      await tx.pipelineStatus.delete({ where: { id: statusId } });

      await this.audit.record(context, {
        actorUserId,
        action: 'pipeline.status_deleted',
        entityType: 'pipeline_status',
        entityId: statusId,
      });
    });
  }

  async resolveStatus(context: TenantContext, statusId: string): Promise<{ status: PipelineStatus; stage: PipelineStage } | null> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const row = await tx.pipelineStatus.findFirst({
        where: { id: statusId, organizationId: context.organizationId as string },
        include: { stage: true },
      });
      if (!row) return null;
      const { stage, ...status } = row as PipelineStatus & { stage: PipelineStage };
      return { status, stage };
    });
  }

  private assertValidCategory(category: string): asserts category is StageCategory {
    if (!(STAGE_CATEGORIES as readonly string[]).includes(category)) {
      throw new BadRequestException(`Invalid stage category '${category}'`);
    }
  }
}
