import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { MODERATE_UPLOAD_THROTTLE } from '../rate-limit-tiers';
import type { ScopeUser } from '../access/scope';
import { FieldConsentDto, PingBatchDto, UnplannedVisitDto, VisitCheckInDto, VisitCheckOutDto, VisitPlanDto } from './field.dto';
import { FieldService } from './field.service';

// Field force (TIM-32 map, TIM-33 visits and beat plan). Permissions, checked again in the service:
//   no key (self, never acting for someone)   /time/me/field…: the notice, consent and withdrawal, location uploads,
//                                              my beat today, visit check-in / check-out, unplanned visits
//   implicit (YX-SEC-04) or attendance.view    the map and a person's trail (in scope; else 404); mark flags reviewed
//   implicit or roster.manage                  plan and cancel visits for someone else (never one's own)
@Controller('time')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FieldController {
  constructor(private readonly field: FieldService) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  @Get('me/field')
  me(@CurrentTenant() ctx: TenantContext) {
    return this.field.me(ctx);
  }

  @Post('me/field/consent')
  consent(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: FieldConsentDto) {
    return this.field.consent(ctx, this.user(req), dto.noticeVersion);
  }

  @Post('me/field/consent/withdraw')
  @HttpCode(200)
  withdraw(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.field.withdraw(ctx, this.user(req));
  }

  // A phone sends one batch every few minutes; the limit stops a runaway client, not a normal day.
  @Post('me/field/pings')
  @HttpCode(200)
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  pings(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: PingBatchDto) {
    return this.field.pings(ctx, this.user(req), dto);
  }

  @Post('me/field/visits')
  unplanned(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: UnplannedVisitDto) {
    return this.field.unplanned(ctx, this.user(req), dto);
  }

  @Post('me/field/visits/:id/check-in')
  @HttpCode(200)
  checkIn(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VisitCheckInDto) {
    return this.field.checkIn(ctx, this.user(req), id, dto);
  }

  @Post('me/field/visits/:id/check-out')
  @HttpCode(200)
  checkOut(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VisitCheckOutDto) {
    return this.field.checkOut(ctx, this.user(req), id, dto);
  }

  @Get('field')
  overview(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.field.overview(ctx, this.user(req));
  }

  @Get('field/people/:employeeId')
  person(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return this.field.person(ctx, this.user(req), employeeId);
  }

  @Post('field/people/:employeeId/flags/review')
  @HttpCode(200)
  review(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return this.field.review(ctx, this.user(req), employeeId);
  }

  @Post('field/visits')
  plan(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: VisitPlanDto) {
    return this.field.plan(ctx, this.user(req), dto);
  }

  @Post('field/visits/:id/cancel')
  @HttpCode(200)
  cancel(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.field.cancel(ctx, this.user(req), id);
  }
}
