import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { ScopeUser } from '../access/scope';
import { assertOwnSession } from '../service-desk/desk-access';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { HiringRequisitionsService } from './requisitions.service';
import { CancelRequisitionDto, RecordBiasAuditDto, SaveHiringSettingsDto, CareersEntityDto, ConsentNoticeDto, RecruitingCostDto, PlanDto, PlanQueryDto, PlanVersionDto } from './hiring-dto';
import { CareersAdminService } from './careers-admin.service';
import { RediscoveryService } from './rediscovery.service';
import { HiringSettingsService } from './hiring-settings.service';
import { BiasAuditService } from './bias-audit.service';

// Recruitment batch AT2 (M10-BUILD-DESIGN §18.1): headcount plans (ats.headcount.manage) and the plan lines a
// requisition can draw on (anyone who raises or runs requisitions). Requisitions themselves are jobs (/jobs, AT1).
/** Plans are changed by the signed-in person themselves, never while acting for someone else. */
function ownSession(req: Request): void {
  const user = req.user as ScopeUser | undefined;
  if (user?.impersonatorUserId || user?.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
}

@Controller('hiring')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class HiringController {
  constructor(
    private readonly svc: HiringRequisitionsService,
    private readonly careers: CareersAdminService,
    private readonly rediscovery: RediscoveryService,
    private readonly hiringSettings: HiringSettingsService,
    private readonly biasAudits: BiasAuditService,
  ) {}

  // Settings 6.1 Hiring: recruiting, hiring admins and HR read it; the hiring settings key (or HR's settings key), held
  // for the whole company, changes it; never while acting for someone else.
  @Get('settings')
  @RequireAnyPermission('ats.settings.manage', 'org.settings.manage', 'pipeline:manage', 'pipelines:configure', 'ats.headcount.manage', 'ats.referral.manage')
  settings(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.hiringSettings.read(ctx, req.user as ScopeUser);
  }

  @Put('settings')
  @RequireAnyPermission('ats.settings.manage', 'org.settings.manage')
  saveSettings(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: SaveHiringSettingsDto) {
    ownSession(req);
    return this.hiringSettings.save(ctx, req.user as ScopeUser, dto.changes);
  }

  // HIR-01: HR sees every plan; a hiring manager their own department's approved plan, read-only (decision 11).
  @Get('plans')
  @RequireAnyPermission('ats.headcount.manage', 'ats.requisition.raise')
  plans(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: PlanQueryDto) {
    return this.svc.plans(ctx, req.user as ScopeUser, q.fy);
  }

  @Post('plans')
  @RequirePermissions('ats.headcount.manage')
  create(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Body() dto: PlanDto) {
    ownSession(req);
    return this.svc.savePlan(ctx, userId, null, dto);
  }

  @Put('plans/:id')
  @RequirePermissions('ats.headcount.manage')
  update(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PlanDto) {
    ownSession(req);
    return this.svc.savePlan(ctx, userId, id, dto);
  }

  @Post('plans/:id/submit')
  @HttpCode(200)
  @RequirePermissions('ats.headcount.manage')
  submit(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PlanVersionDto) {
    ownSession(req);
    return this.svc.submitPlan(ctx, userId, id, dto.version);
  }

  // HIR-02: recruiting and HR see every requisition; a hiring manager their own, read-only (decision 11).
  @Get('requisitions')
  @RequireAnyPermission('pipeline:manage', 'ats.headcount.manage', 'ats.requisition.raise')
  requisitions(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.svc.requisitions(ctx, req.user as ScopeUser);
  }

  // HIR-26: past candidates to consider for a requisition (advisory; plain text search when the company has AI off).
  @Get('requisitions/:id/rediscovery')
  @RequireAnyPermission('pipeline:manage', 'ats.headcount.manage', 'ats.requisition.raise')
  rediscover(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.rediscovery.suggest(ctx, req.user as ScopeUser, id);
  }

  // HIR-02 answers 253 and 293: cancel a requisition with a reason: recruiting any, a hiring manager their own while it
  // waits for approval; never while acting for someone else.
  @Post('requisitions/:id/cancel')
  @HttpCode(200)
  @RequireAnyPermission('pipeline:manage', 'ats.requisition.raise')
  cancelRequisition(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelRequisitionDto) {
    ownSession(req);
    return this.svc.cancel(ctx, req.user as ScopeUser, id, dto.reason);
  }

  // HIR-26 answer 255: suggest a past candidate to the requisition's recruiter (bell notice, once per candidate).
  @Post('requisitions/:id/rediscovery/:candidateId/suggest')
  @HttpCode(200)
  @RequireAnyPermission('pipeline:manage', 'ats.headcount.manage', 'ats.requisition.raise')
  suggestCandidate(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('candidateId', ParseUUIDPipe) candidateId: string) {
    ownSession(req);
    return this.rediscovery.suggestToRecruiter(ctx, req.user as ScopeUser, id, candidateId);
  }

  @Get('plan-lines')
  @RequireAnyPermission('ats.headcount.manage', 'ats.requisition.raise', 'pipeline:manage')
  lines(@CurrentTenant() ctx: TenantContext, @Query() q: PlanQueryDto) {
    return this.svc.openLines(ctx, q.departmentId);
  }

  // AT3: careers site settings (the same key as the company's other careers settings).
  @Get('consent-notices')
  @RequirePermissions('org:manage_settings')
  notices(@CurrentTenant() ctx: TenantContext) {
    return this.careers.notices(ctx);
  }

  @Post('consent-notices')
  @RequirePermissions('org:manage_settings')
  publishNotice(@CurrentTenant() ctx: TenantContext, @Body() dto: ConsentNoticeDto) {
    return this.careers.publishNotice(ctx, dto);
  }

  @Get('careers-entities')
  @RequirePermissions('org:manage_settings')
  entities(@CurrentTenant() ctx: TenantContext) {
    return this.careers.entities(ctx);
  }

  @Put('careers-entities/:legalEntityId')
  @RequirePermissions('org:manage_settings')
  saveEntity(@CurrentTenant() ctx: TenantContext, @Param('legalEntityId', ParseUUIDPipe) id: string, @Body() dto: CareersEntityDto) {
    return this.careers.saveEntity(ctx, id, dto);
  }

  @Delete('careers-entities/:legalEntityId')
  @RequirePermissions('org:manage_settings')
  removeEntity(@CurrentTenant() ctx: TenantContext, @Param('legalEntityId', ParseUUIDPipe) id: string) {
    return this.careers.removeEntity(ctx, id);
  }

  // HIR-11 (founder answer 202): its own hiring key, for HR and recruiters (granted through the role templates).
  @Get('costs')
  @RequirePermissions('ats.costs.manage')
  async costs(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    await this.careers.costsGate(req.user as ScopeUser);
    return this.careers.costs(ctx);
  }

  @Get('costs/overview')
  @RequirePermissions('ats.costs.manage')
  async costsOverview(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    await this.careers.costsGate(req.user as ScopeUser);
    return this.careers.costsOverview(ctx);
  }

  // HIR-11: entering a cost is the person's own act, so it is refused while acting for someone else.
  @Post('costs')
  @RequirePermissions('ats.costs.manage')
  async addCost(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: RecruitingCostDto) {
    assertOwnSession(req);
    await this.careers.costsGate(req.user as ScopeUser);
    return this.careers.addCost(ctx, dto);
  }

  @Put('costs/:id')
  @RequirePermissions('ats.costs.manage')
  async updateCost(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RecruitingCostDto) {
    assertOwnSession(req);
    await this.careers.costsGate(req.user as ScopeUser);
    return this.careers.updateCost(ctx, id, dto);
  }

  @Delete('costs/:id')
  @RequirePermissions('ats.costs.manage')
  async removeCost(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    await this.careers.costsGate(req.user as ScopeUser);
    return this.careers.removeCost(ctx, id);
  }

  // HIR-23 Bias audits: recruiting and the hiring settings holders read; recording needs the hiring settings key for the
  // whole company (checked in the service) and is refused while acting for someone else.
  @Get('bias-audits')
  @RequireAnyPermission('ats.settings.manage', 'org.settings.manage', 'pipeline:manage')
  biasAuditView(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.biasAudits.view(ctx, req.user as ScopeUser);
  }

  @Post('bias-audits')
  @RequireAnyPermission('ats.settings.manage', 'org.settings.manage')
  recordBiasAudit(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: RecordBiasAuditDto) {
    assertOwnSession(req);
    return this.biasAudits.record(ctx, req.user as ScopeUser, dto);
  }

  @Get('bias-audits/:id/report')
  @RequireAnyPermission('ats.settings.manage', 'org.settings.manage', 'pipeline:manage')
  biasAuditReport(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.biasAudits.report(ctx, id);
  }
}
