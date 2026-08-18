import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { PipelineService, PatchEntryResult } from './pipeline.service';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { AddEntryDto } from './dto/add-entry.dto';
import { PatchEntryDto } from './dto/patch-entry.dto';
import { LinkExamDto } from './dto/link-exam.dto';
import { AddFeedbackDto } from './dto/add-feedback.dto';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PipelineController {
  constructor(private readonly pipelineService: PipelineService) {}

  @Post('jobs')
  @RequirePermissions('pipeline:manage')
  createJob(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: CreateJobDto) {
    return this.pipelineService.createJob(tenant, userId, dto);
  }

  @Get('jobs')
  @RequirePermissions('results:view')
  listJobs(@CurrentTenant() tenant: TenantContext, @Query('status') status?: 'open' | 'closed') {
    return this.pipelineService.listJobs(tenant, status);
  }

  @Get('jobs/:id')
  @RequirePermissions('results:view')
  getJob(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.pipelineService.getJob(tenant, id);
  }

  @Patch('jobs/:id')
  @RequirePermissions('pipeline:manage')
  updateJob(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateJobDto,
  ) {
    return this.pipelineService.updateJob(tenant, userId, id, dto);
  }

  @Delete('jobs/:id')
  @RequirePermissions('pipeline:manage')
  deleteJob(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.pipelineService.deleteJob(tenant, userId, id);
  }

  @Get('jobs/:id/pipeline')
  @RequirePermissions('results:view')
  getPipeline(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.pipelineService.getPipeline(tenant, id);
  }

  @Post('jobs/:id/entries')
  @RequirePermissions('pipeline:manage')
  addEntry(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: AddEntryDto,
  ) {
    return this.pipelineService.addEntry(tenant, userId, id, dto);
  }

  @Patch('entries/:id')
  @RequirePermissions('pipeline:manage')
  patchEntry(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: PatchEntryDto,
  ): Promise<PatchEntryResult> {
    return this.pipelineService.patchEntry(tenant, userId, id, dto);
  }

  @Delete('entries/:id')
  @RequirePermissions('pipeline:manage')
  deleteEntry(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.pipelineService.deleteEntry(tenant, userId, id);
  }

  @Post('jobs/:id/exams')
  @RequirePermissions('pipeline:manage')
  linkExam(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: LinkExamDto,
  ) {
    return this.pipelineService.linkExam(tenant, userId, id, dto.examId);
  }

  @Delete('jobs/:id/exams/:examId')
  @RequirePermissions('pipeline:manage')
  unlinkExam(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Param('examId') examId: string,
  ) {
    return this.pipelineService.unlinkExam(tenant, userId, id, examId);
  }

  @Post('entries/:id/feedback')
  @RequirePermissions('results:view')
  addFeedback(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: AddFeedbackDto,
  ) {
    return this.pipelineService.addFeedback(tenant, userId, id, dto);
  }

  @Get('entries/:id/feedback')
  @RequirePermissions('results:view')
  listFeedback(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.pipelineService.listFeedback(tenant, id);
  }
}
