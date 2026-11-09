import { Throttle } from '@nestjs/throttler';
import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import type { ScopeUser } from '../access/scope';
import { assertOwnSession } from '../service-desk/desk-access';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { OfferBuilderService } from './offer-builder.service';
import { OfferConditionDto, OfferConditionMetDto, OfferConditionWaiveDto, OfferCreateDto, OfferPreviewDto, OfferReviseDto } from './dto/offer-builder.dto';

// HIR-09 offer builder and HIR-29 conditions. Recruiting (ats.offer.manage, or the older pipeline:manage) reads and works
// offers; amounts need ats.offer.compensation.view (checked in the service). Every write is refused while acting for
// someone else. Sending, the letter, withdraw and accept by link stay on the offers routes (OffersController).
@Controller('hiring/offers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OfferBuilderController {
  constructor(private readonly offers: OfferBuilderService) {}

  @Get('setup')
  @RequireAnyPermission('ats.offer.manage', 'pipeline:manage')
  setup(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query('entryId', ParseUUIDPipe) entryId: string) {
    return this.offers.setup(ctx, req.user as ScopeUser, entryId);
  }

  /** Careers answer 355: the pay the applicant gave when asked, for holders of the offer-pay key only. */
  @Get('current-pay')
  @RequireAnyPermission('ats.offer.manage', 'pipeline:manage')
  currentPay(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query('entryId', ParseUUIDPipe) entryId: string) {
    return this.offers.currentPay(ctx, req.user as ScopeUser, entryId);
  }

  @Post('preview')
  @HttpCode(200)
  @RequireAnyPermission('ats.offer.manage', 'pipeline:manage')
  preview(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: OfferPreviewDto) {
    return this.offers.preview(ctx, req.user as ScopeUser, dto);
  }

  @Post()
  @RequireAnyPermission('ats.offer.manage', 'pipeline:manage')
  create(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: OfferCreateDto) {
    assertOwnSession(req);
    return this.offers.create(ctx, req.user as ScopeUser, dto);
  }

  @Get(':id')
  @RequireAnyPermission('ats.offer.manage', 'pipeline:manage')
  record(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.offers.record(ctx, req.user as ScopeUser, id);
  }

  @Post(':id/versions')
  @RequireAnyPermission('ats.offer.manage', 'pipeline:manage')
  revise(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: OfferReviseDto) {
    assertOwnSession(req);
    return this.offers.revise(ctx, req.user as ScopeUser, id, dto);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @RequireAnyPermission('ats.offer.manage', 'pipeline:manage')
  submit(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.offers.submit(ctx, (req.user as ScopeUser).userId!, id);
  }

  /** Answer 336: the recruiter's Send reminder (the offer, or what is still due); never automatic. */
  @Post(':id/remind')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @RequireAnyPermission('ats.offer.manage', 'pipeline:manage')
  remind(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.offers.remind(ctx, id);
  }

  @Post(':id/conditions')
  @RequireAnyPermission('ats.offer.manage', 'pipeline:manage')
  addCondition(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: OfferConditionDto) {
    assertOwnSession(req);
    return this.offers.addCondition(ctx, id, dto);
  }

  @Post(':id/conditions/:conditionId/met')
  @HttpCode(200)
  @RequireAnyPermission('ats.offer.manage', 'pipeline:manage')
  met(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('conditionId', ParseUUIDPipe) conditionId: string, @Body() dto: OfferConditionMetDto) {
    assertOwnSession(req);
    return this.offers.decideCondition(ctx, id, conditionId, 'met', dto.note ?? null);
  }

  @Post(':id/conditions/:conditionId/waive')
  @HttpCode(200)
  @RequireAnyPermission('ats.offer.manage', 'pipeline:manage')
  waive(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('conditionId', ParseUUIDPipe) conditionId: string, @Body() dto: OfferConditionWaiveDto) {
    assertOwnSession(req);
    return this.offers.decideCondition(ctx, id, conditionId, 'waived', dto.reason);
  }
}
