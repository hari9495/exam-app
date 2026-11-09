import { Body, Controller, Delete, ForbiddenException, Get, Header, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { CurrentUserRole } from '../auth/current-user-role.decorator';
import { TenantContext } from '@exam-platform/shared';
import { PipelineService, PatchEntryResult } from './pipeline.service';
import { CreateJobDto, RaiseRequisitionDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { AddEntryDto } from './dto/add-entry.dto';
import { PatchEntryDto } from './dto/patch-entry.dto';
import { LinkExamDto } from './dto/link-exam.dto';
import { AddFeedbackDto } from './dto/add-feedback.dto';
import { AssignEntryDto } from './dto/assign-entry.dto';
import { BulkPatchEntriesDto } from './dto/bulk-patch-entries.dto';
import { SetChecklistItemDto } from './dto/set-checklist-item.dto';

/** HIR-03: a job is created or changed only by the person themselves, never while acting for someone else. */
function notActing(req: { user?: { impersonatorUserId?: string; actingSuperAdmin?: boolean } }) {
  if (req.user?.impersonatorUserId || req.user?.actingSuperAdmin) throw new ForbiddenException('Jobs cannot be changed while acting for someone else. Sign in as yourself.');
}

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PipelineController {
  constructor(private readonly pipelineService: PipelineService) {}

  @Post('jobs')
  @RequirePermissions('pipeline:manage')
  createJob(@Req() req: Parameters<typeof notActing>[0], @CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: CreateJobDto) {
    notActing(req);
    return this.pipelineService.createJob(tenant, userId, dto);
  }

  /** PPL-08 "Request a hire": a requisition raised by a manager; always goes for approval. */
  @Post('jobs/requisitions')
  @RequirePermissions('ats.requisition.raise')
  raiseRequisition(@Req() req: Parameters<typeof notActing>[0], @CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: RaiseRequisitionDto) {
    notActing(req);
    return this.pipelineService.raiseRequisition(tenant, userId, dto);
  }

  /** HIR-02 answer 252: the hiring manager changes their own sent-back requisition and sends it again. */
  @Put('jobs/requisitions/:id')
  @RequirePermissions('ats.requisition.raise')
  resendRequisition(@Req() req: Parameters<typeof notActing>[0], @CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RaiseRequisitionDto) {
    notActing(req);
    return this.pipelineService.resendRequisition(tenant, userId, id, dto);
  }

  @Get('jobs')
  @RequirePermissions('results:view')
  listJobs(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserRole() role: string,
    @Query('status') status?: 'open' | 'closed',
    @Query('search') search?: string,
  ) {
    return this.pipelineService.listJobs(tenant, status, role, search);
  }

  /** HIR-24: the company's pay choices for new jobs (company level; a location's own setting and law apply on save). */
  @Get('jobs/pay-settings')
  @RequirePermissions('results:view')
  paySettings(@CurrentTenant() tenant: TenantContext) {
    return this.pipelineService.paySettings(tenant);
  }

  @Get('jobs/:id')
  @RequirePermissions('results:view')
  getJob(@CurrentTenant() tenant: TenantContext, @CurrentUserRole() role: string, @Param('id') id: string) {
    return this.pipelineService.getJob(tenant, id, role);
  }

  @Patch('jobs/:id')
  @RequirePermissions('pipeline:manage')
  updateJob(
    @Req() req: Parameters<typeof notActing>[0],
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @CurrentUserRole() role: string,
    @Param('id') id: string,
    @Body() dto: UpdateJobDto,
  ) {
    notActing(req);
    return this.pipelineService.updateJob(tenant, userId, id, dto, role);
  }

  @Delete('jobs/:id')
  @RequirePermissions('pipeline:manage')
  deleteJob(@Req() req: Parameters<typeof notActing>[0], @CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    notActing(req);
    return this.pipelineService.deleteJob(tenant, userId, id);
  }

  @Post('jobs/:id/submit')
  @RequirePermissions('pipeline:manage')
  submitRequisition(@Req() req: Parameters<typeof notActing>[0], @CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    notActing(req);
    return this.pipelineService.submitRequisition(tenant, userId, id);
  }

  @Post('jobs/:id/approval/cancel')
  @RequirePermissions('pipeline:manage')
  cancelRequisitionApproval(@Req() req: Parameters<typeof notActing>[0], @CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    notActing(req);
    return this.pipelineService.cancelRequisitionApproval(tenant, userId, id);
  }

  @Get('jobs/:id/pipeline')
  @RequirePermissions('results:view')
  getPipeline(@CurrentTenant() tenant: TenantContext, @CurrentUserRole() role: string, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.pipelineService.getBoard(tenant, id, role, userId);
  }

  @Get('jobs/:id/candidates.csv')
  @RequirePermissions('results:view')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="candidates.csv"')
  exportCandidatesCsv(@CurrentTenant() tenant: TenantContext, @CurrentUserRole() role: string, @Param('id') id: string) {
    return this.pipelineService.exportJobCandidatesCsv(tenant, id, role);
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

  @Post('entries/bulk')
  @RequirePermissions('pipeline:manage')
  bulkPatchEntries(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: BulkPatchEntriesDto) {
    return this.pipelineService.bulkPatchEntries(tenant, userId, dto);
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

  @Patch('entries/:id/assignment')
  @RequirePermissions('results:view')
  assignEntry(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: AssignEntryDto,
  ) {
    return this.pipelineService.assignEntry(tenant, userId, id, { userId: dto.assigneeUserId ?? null, groupId: dto.assigneeGroupId ?? null });
  }

  @Patch('entries/:id/checklist')
  @RequirePermissions('pipeline:manage')
  setChecklistItem(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: SetChecklistItemDto,
  ) {
    return this.pipelineService.setChecklistItem(tenant, userId, id, dto.itemId, dto.done);
  }
}
