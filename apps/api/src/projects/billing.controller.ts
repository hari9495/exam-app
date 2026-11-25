import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import type { ScopeUser } from '../access/scope';
import { ProjectBillingService } from './project-billing.service';
import { BillingDraftDto, CorrectionDto, VersionDto } from './dto';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const month = (m?: string) => {
  if (m && !MONTH.test(m)) throw new BadRequestException('Give the month as YYYY-MM.');
  return m;
};

// Projects P-6 (PRJ-05, PRJ-06; answers 1414 to 1416). The service checks Projects finance (and the account manager's
// key for the 1415 approval). Registered before ProjectsController (its :id route).
@Controller('projects/billing')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProjectBillingController {
  constructor(private readonly billing: ProjectBillingService) {}

  @Get()
  workbench(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query('month') m?: string) {
    return this.billing.workbench(ctx, req.user as ScopeUser, month(m));
  }

  @Post('drafts')
  draft(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: BillingDraftDto) {
    return this.billing.draft(ctx, req.user as ScopeUser, dto);
  }

  @Delete('drafts/:id')
  deleteDraft(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.billing.deleteDraft(ctx, req.user as ScopeUser, id);
  }

  @Post('drafts/:id/approve')
  approve(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VersionDto) {
    return this.billing.approve(ctx, req.user as ScopeUser, id, dto.version);
  }

  @Post('drafts/:id/issue')
  issue(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VersionDto) {
    return this.billing.issue(ctx, req.user as ScopeUser, id, dto.version);
  }

  /** PRJ-01 workspace Billing tab. */
  @Get('project/:id')
  projectTab(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.billing.projectTab(ctx, req.user as ScopeUser, id);
  }

  @Get('lines')
  lines(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query('projectId', ParseUUIDPipe) projectId: string, @Query('month') m?: string) {
    if (!m) throw new BadRequestException('Give the month as YYYY-MM.');
    return this.billing.lines(ctx, req.user as ScopeUser, projectId, month(m)!);
  }

  @Get('lines/:lineId')
  line(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('lineId', ParseUUIDPipe) lineId: string) {
    return this.billing.line(ctx, req.user as ScopeUser, lineId);
  }

  @Post('lines/:lineId/correct')
  correct(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('lineId', ParseUUIDPipe) lineId: string, @Body() dto: CorrectionDto) {
    return this.billing.correct(ctx, req.user as ScopeUser, lineId, dto);
  }
}
