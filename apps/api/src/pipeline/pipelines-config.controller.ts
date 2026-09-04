import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { PipelinesService } from './pipelines.service';
import { CreatePipelineDto } from './dto/create-pipeline.dto';
import { CreateStageDto } from './dto/create-stage.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { CreateStatusDto } from './dto/create-status.dto';
import { UpdateStatusDto } from './dto/update-status.dto';

// Dedicated pipelines *config* controller (mirrors the approvals split:
// approvals-config.controller.ts vs approvals.controller.ts) -- everything here is gated
// behind the org_admin-only 'pipelines:configure' permission, separate from the runtime
// pipeline.controller.ts routes (jobs/entries) used day-to-day by recruiters.
@Controller('pipelines')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PipelinesConfigController {
  constructor(private readonly pipelines: PipelinesService) {}

  @Get()
  @RequirePermissions('pipelines:configure')
  list(@CurrentTenant() tenant: TenantContext) {
    return this.pipelines.listPipelines(tenant);
  }

  @Post()
  @RequirePermissions('pipelines:configure')
  create(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: CreatePipelineDto) {
    return this.pipelines.createPipeline(tenant, userId, dto);
  }

  @Delete(':id')
  @RequirePermissions('pipelines:configure')
  remove(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.pipelines.deletePipeline(tenant, userId, id);
  }

  // ponytail: pipelineId is trusted to RLS org-scoping here, not re-verified against the
  // caller's org before insert -- a mismatched id can't leak cross-tenant (RLS blocks the
  // read side too) but could create an orphan stage row. Cheap enough to add a
  // pipelines.listPipelines-style existence check later if that turns out to matter.
  @Post(':id/stages')
  @RequirePermissions('pipelines:configure')
  createStage(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') pipelineId: string,
    @Body() dto: CreateStageDto,
  ) {
    return this.pipelines.createStage(tenant, userId, pipelineId, dto);
  }

  @Patch('stages/:stageId')
  @RequirePermissions('pipelines:configure')
  updateStage(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('stageId') stageId: string,
    @Body() dto: UpdateStageDto,
  ) {
    return this.pipelines.updateStage(tenant, userId, stageId, dto);
  }

  @Delete('stages/:stageId')
  @RequirePermissions('pipelines:configure')
  removeStage(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('stageId') stageId: string) {
    return this.pipelines.deleteStage(tenant, userId, stageId);
  }

  // ponytail: same trust-to-RLS note as createStage above -- stageId is not re-verified
  // against the caller's org before the status insert.
  @Post('stages/:stageId/statuses')
  @RequirePermissions('pipelines:configure')
  createStatus(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('stageId') stageId: string,
    @Body() dto: CreateStatusDto,
  ) {
    return this.pipelines.createStatus(tenant, userId, stageId, dto);
  }

  @Patch('statuses/:statusId')
  @RequirePermissions('pipelines:configure')
  updateStatus(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('statusId') statusId: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.pipelines.updateStatus(tenant, userId, statusId, dto);
  }

  @Delete('statuses/:statusId')
  @RequirePermissions('pipelines:configure')
  removeStatus(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('statusId') statusId: string) {
    return this.pipelines.deleteStatus(tenant, userId, statusId);
  }
}
