import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { RequireStepUp } from '../auth/step-up.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import { ownSession } from '../org-structure/org-structure.controller';
import { STRICT_AUTH_THROTTLE } from '../rate-limit-tiers';
import { CreateSmsAccountDto, DeliveriesQueryDto, UpdateSmsAccountDto } from '../sms-channel/dto';
import { SmsAccountsService } from '../sms-channel/sms-accounts.service';
import {
  CompaniesQueryDto,
  CreateCompanyDto,
  ExtendTrialDto,
  LifecycleDto,
  PlatformAuditQueryDto,
  PriceDto,
  SupportApproveDto,
  SupportListQueryDto,
  SupportNoteDto,
  SupportRequestDto,
} from './dto';
import { PLATFORM, PlatformService } from './platform.service';
import { PlatformStaffGuard } from './platform-staff.guard';
import { SupportSessionsService } from './support-sessions.service';

// The YukthiX platform console API (P14 §7, YX-CONSOLE-01/02). Staff only, on their own platform session with their
// security key (PlatformStaffGuard), and every route names its platform.* key (PermissionsGuard). Company data is
// never read here except account facts; HR data only through a support session the company approved.
@Controller('platform')
@UseGuards(JwtAuthGuard, PlatformStaffGuard, PermissionsGuard)
export class PlatformController {
  constructor(
    private readonly platform: PlatformService,
    private readonly support: SupportSessionsService,
    private readonly sms: SmsAccountsService,
  ) {}

  // ---- companies ----

  @Get('companies')
  @RequirePermissions('platform.companies.view')
  companies(@CurrentUserId() actor: string, @Query() q: CompaniesQueryDto) {
    return this.platform.listCompanies(actor, q);
  }

  @Get('companies/:id')
  @RequirePermissions('platform.companies.view')
  company(@CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.platform.company(actor, id);
  }

  @Post('companies')
  @RequirePermissions('platform.companies.manage')
  createCompany(@CurrentTenant() ctx: TenantContext, @CurrentUserId() actor: string, @Body() dto: CreateCompanyDto) {
    return this.platform.createCompany(ctx, actor, dto);
  }

  // Suspending or closing stops everyone at the company from signing in: step-up (P12 YX-IAM-02).
  @Post('companies/:id/lifecycle')
  @HttpCode(200)
  @RequirePermissions('platform.companies.manage')
  @RequireStepUp()
  lifecycle(@CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LifecycleDto) {
    return this.platform.changeLifecycle(actor, id, dto);
  }

  @Post('companies/:id/extend-trial')
  @HttpCode(200)
  @RequirePermissions('platform.companies.manage')
  extendTrial(@CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ExtendTrialDto) {
    return this.platform.extendTrial(actor, id, dto);
  }

  // ---- plans and prices (one plan per product, so the routes say products; /platform/plans is the exam app's) ----

  @Get('products')
  @RequireAnyPermission('platform.companies.view', 'platform.plans.manage')
  plans() {
    return this.platform.plans();
  }

  @Post('products/:code/prices')
  @RequirePermissions('platform.plans.manage')
  @RequireStepUp()
  schedulePrice(@CurrentUserId() actor: string, @Param('code') code: string, @Body() dto: PriceDto) {
    return this.platform.schedulePrice(actor, code.slice(0, 32), dto);
  }

  @Delete('products/prices/:id')
  @RequirePermissions('platform.plans.manage')
  @RequireStepUp()
  withdrawPrice(@CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.platform.withdrawPrice(actor, id);
  }

  // ---- support sessions (P02 Q8) ----

  @Get('support-sessions')
  @RequirePermissions('platform.support.request')
  supportSessions(@CurrentUserId() actor: string, @Query() q: SupportListQueryDto) {
    return this.support.listForStaff(actor, q.organizationId);
  }

  @Post('companies/:id/support-sessions')
  @RequirePermissions('platform.support.request')
  requestSupport(@CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SupportRequestDto) {
    return this.support.request(actor, id, dto);
  }

  @Post('support-sessions/:id/cancel')
  @HttpCode(200)
  @RequirePermissions('platform.support.request')
  cancelSupport(@CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.support.closeByStaff(actor, id, 'cancel');
  }

  @Post('support-sessions/:id/end')
  @HttpCode(200)
  @RequirePermissions('platform.support.request')
  endSupport(@CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.support.closeByStaff(actor, id, 'end');
  }

  // ---- the platform audit log ----

  @Get('audit')
  @RequirePermissions('platform.audit.view')
  audit(@CurrentUserId() actor: string, @Query() q: PlatformAuditQueryDto) {
    return this.platform.audit(actor, q);
  }

  // ---- shared channel accounts: the YukthiX shared SMS account (P04 §4.5a), moved here from company settings ----

  @Get('channels/sms')
  @RequirePermissions('platform.channels.manage')
  smsOverview() {
    return this.sms.overview(PLATFORM);
  }

  @Post('channels/sms/accounts')
  @RequirePermissions('platform.channels.manage')
  @RequireStepUp()
  createSms(@CurrentUserId() actor: string, @Body() dto: CreateSmsAccountDto) {
    return this.sms.create(PLATFORM, actor, dto);
  }

  @Patch('channels/sms/accounts/:id')
  @RequirePermissions('platform.channels.manage')
  @RequireStepUp()
  updateSms(@CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSmsAccountDto) {
    return this.sms.update(PLATFORM, actor, id, dto);
  }

  @Delete('channels/sms/accounts/:id')
  @HttpCode(204)
  @RequirePermissions('platform.channels.manage')
  @RequireStepUp()
  async removeSms(@CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.sms.remove(PLATFORM, actor, id);
  }

  // Only to the staff member's own verified number.
  @Post('channels/sms/accounts/:id/test')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  @RequirePermissions('platform.channels.manage')
  testSms(@CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.sms.test(PLATFORM, actor, id);
  }

  @Get('channels/sms/deliveries')
  @RequirePermissions('platform.channels.manage')
  smsDeliveries(@Query() q: DeliveriesQueryDto) {
    return this.sms.deliveries(PLATFORM, q.before);
  }
}

// Settings › Support access (APX-D PLT-17, P02 Q8): the company's System Admin decides on every YukthiX support
// session and sees all that was done in it. Decisions are made by the person themselves (never by someone acting
// for them, and never by YukthiX staff inside the company).
@Controller('support-access')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SupportAccessController {
  constructor(private readonly support: SupportSessionsService) {}

  @Get()
  @RequirePermissions('org.support_access.approve')
  list(@CurrentTenant() ctx: TenantContext) {
    return this.support.listForCompany(ctx);
  }

  @Get(':id/activity')
  @RequirePermissions('org.support_access.approve')
  activity(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.support.activity(ctx, id);
  }

  // Letting someone outside the company see its data: step-up (P12 YX-IAM-02).
  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermissions('org.support_access.approve')
  @RequireStepUp()
  approve(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SupportApproveDto) {
    ownSession(req);
    return this.support.approve(ctx, actor, id, dto);
  }

  @Post(':id/decline')
  @HttpCode(200)
  @RequirePermissions('org.support_access.approve')
  decline(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SupportNoteDto) {
    ownSession(req);
    return this.support.decline(ctx, actor, id, dto.note);
  }

  @Post(':id/end')
  @HttpCode(200)
  @RequirePermissions('org.support_access.approve')
  end(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SupportNoteDto) {
    ownSession(req);
    return this.support.endByCompany(ctx, actor, id, dto.note);
  }
}
