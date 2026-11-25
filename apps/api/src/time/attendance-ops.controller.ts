import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { Type } from 'class-transformer';
import { IsInt, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { RequireStepUp } from '../auth/step-up.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { MODERATE_UPLOAD_THROTTLE } from '../rate-limit-tiers';
import type { ScopeUser } from '../access/scope';
import { AttendanceOpsService } from './attendance-ops.service';
import { DeviceBackfillService } from './device-backfill.service';
import { IndustrialActionService } from './industrial-action.service';
import { DeviceRefQueryDto, EntityQueryDto, ExceptionsQueryDto, EventDatesDto, EventVersionDto, IndustrialActionDto, LegalityDto, MarkPresentDto, OpsMonthQueryDto, OtDecisionDto, PageQueryDto, PeriodReasonDto, PeriodRefDto, PresenceConsentDto, PresenceSignalDto, ResolveDto } from './ops-dto';
import { OvertimeService } from './overtime.service';
import { PeriodsService } from './periods.service';
import { PresenceService } from './presence.service';

class ApplyBackfillDto {
  @IsUUID()
  legalEntityId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  deviceRef!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  punches!: number;
}

// Time ops (29 Oct 2026): attendance, overtime and periods. Permissions (P02), checked again in the services:
//   no key (self)              presence consent and my presence states (TIM-36)
//   implicit (YX-SEC-04)       a manager: today's board, exceptions, reports and presence days of their team; deciding
//                              overtime they hold the approval task for (TIM-09)
//   attendance.view            HR: the same over the people in scope, and the women's night-shift register
//   leave.approve              HR resolves exceptions and marks people present, over the person, never one's own day
//   attendance.lock            freeze / open again (second step) / send a month (TIM-02, TIM-11), industrial action and
//                              its past events, paged (TIM-37), device
//                              backfill (TIM-10, with the second sign-in step)
//   attendance.lock.approve    payroll approves the lock HR sent (two-step flow, second sign-in step)
@Controller('time')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AttendanceOpsController {
  constructor(
    private readonly ops: AttendanceOpsService,
    private readonly periods: PeriodsService,
    private readonly overtime: OvertimeService,
    private readonly industrial: IndustrialActionService,
    private readonly presence: PresenceService,
    private readonly device: DeviceBackfillService,
  ) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  // ------------------------------------------------------------------------------------------ TIM-01, 04, 02

  @Get('today')
  today(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: EntityQueryDto) {
    return this.ops.today(ctx, this.user(req), q.legalEntityId);
  }

  @Get('exceptions')
  exceptions(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: ExceptionsQueryDto) {
    return this.ops.exceptions(ctx, this.user(req), q);
  }

  @Post('exceptions/resolve')
  @HttpCode(200)
  @RequirePermissions('leave.approve')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  resolve(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ResolveDto) {
    return this.ops.resolve(ctx, this.user(req), dto);
  }

  @Post('muster/mark-present')
  @HttpCode(200)
  @RequirePermissions('leave.approve')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  markPresent(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: MarkPresentDto) {
    return this.ops.markPresent(ctx, this.user(req), dto);
  }

  // ------------------------------------------------------------------------------------------ TIM-02 / 11 periods

  @Post('periods/freeze')
  @HttpCode(200)
  @RequirePermissions('attendance.lock')
  freeze(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: PeriodRefDto) {
    return this.periods.freeze(ctx, this.user(req), dto.legalEntityId, dto.month);
  }

  // Founder decision 7a (29 Oct 2026): opening a month again asks for a reason and the authenticator code, like Lock.
  @Post('periods/unfreeze')
  @HttpCode(200)
  @RequirePermissions('attendance.lock')
  @RequireStepUp()
  unfreeze(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: PeriodReasonDto) {
    return this.periods.unfreeze(ctx, this.user(req), dto.legalEntityId, dto.month, dto.reason);
  }

  @Post('periods/send')
  @HttpCode(200)
  @RequirePermissions('attendance.lock')
  send(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: PeriodRefDto) {
    return this.periods.send(ctx, this.user(req), dto.legalEntityId, dto.month);
  }

  @Post('periods/approve-lock')
  @HttpCode(200)
  @RequirePermissions('attendance.lock.approve')
  @RequireStepUp()
  approveLock(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: PeriodRefDto) {
    return this.periods.approveLock(ctx, this.user(req), dto.legalEntityId, dto.month);
  }

  // ------------------------------------------------------------------------------------------ TIM-09

  @Post('overtime/:id/decide')
  @HttpCode(200)
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  decideOt(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: OtDecisionDto) {
    return this.overtime.decide(ctx, this.user(req), id, dto.decision, dto.reason ?? null);
  }

  // ------------------------------------------------------------------------------------------ TIM-16

  @Get('reports/attendance')
  attendanceReport(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: OpsMonthQueryDto) {
    return this.ops.attendanceReport(ctx, this.user(req), q.month, q.legalEntityId);
  }

  @Get('reports/night')
  @RequirePermissions('attendance.view')
  nightRegister(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: OpsMonthQueryDto) {
    return this.ops.nightRegister(ctx, this.user(req), q.month, q.legalEntityId);
  }

  // ------------------------------------------------------------------------------------------ TIM-37

  @Get('industrial-actions')
  @RequirePermissions('attendance.lock')
  events(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: PageQueryDto) {
    return this.industrial.list(ctx, this.user(req), q.page ?? 1, q.pageSize ?? 25);
  }

  @Get('industrial-actions/options')
  @RequirePermissions('attendance.lock')
  eventOptions(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.industrial.options(ctx, this.user(req));
  }

  @Get('industrial-actions/:id')
  @RequirePermissions('attendance.lock')
  event(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.industrial.get(ctx, this.user(req), id);
  }

  @Post('industrial-actions')
  @RequirePermissions('attendance.lock')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  record(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: IndustrialActionDto) {
    return this.industrial.create(ctx, this.user(req), dto);
  }

  @Post('industrial-actions/:id/legality')
  @HttpCode(200)
  @RequirePermissions('attendance.lock')
  legality(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LegalityDto) {
    return this.industrial.legality(ctx, this.user(req), id, dto.legality, dto.version);
  }

  @Post('industrial-actions/:id/dates')
  @HttpCode(200)
  @RequirePermissions('attendance.lock')
  dates(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EventDatesDto) {
    return this.industrial.dates(ctx, this.user(req), id, dto);
  }

  @Post('industrial-actions/:id/cancel')
  @HttpCode(200)
  @RequirePermissions('attendance.lock')
  cancelEvent(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EventVersionDto) {
    return this.industrial.cancel(ctx, this.user(req), id, dto.version);
  }

  // ------------------------------------------------------------------------------------------ TIM-36

  @Get('me/presence')
  myPresence(@CurrentTenant() ctx: TenantContext, @Query() q: OpsMonthQueryDto) {
    return this.presence.mine(ctx, q.month);
  }

  @Post('me/presence/consent')
  @HttpCode(200)
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  presenceConsent(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: PresenceConsentDto) {
    return this.presence.consent(ctx, this.user(req), dto.action);
  }

  @Post('me/presence/signals')
  @HttpCode(200)
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  presenceSignals(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: PresenceSignalDto) {
    return this.presence.signals(ctx, this.user(req), dto.signals);
  }

  @Get('presence')
  teamPresence(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: OpsMonthQueryDto) {
    return this.presence.team(ctx, this.user(req), q.month, q.legalEntityId);
  }

  // ------------------------------------------------------------------------------------------ TIM-10

  @Get('device-batches')
  @RequirePermissions('attendance.lock')
  deviceBatches(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: EntityQueryDto) {
    return this.device.batches(ctx, this.user(req), q.legalEntityId);
  }

  @Get('device-batches/preview')
  @RequirePermissions('attendance.lock')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  devicePreview(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: DeviceRefQueryDto) {
    return this.device.preview(ctx, this.user(req), q.legalEntityId, q.deviceRef);
  }

  @Post('device-backfills')
  @RequirePermissions('attendance.lock')
  @RequireStepUp()
  applyBackfill(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ApplyBackfillDto) {
    return this.device.backfill(ctx, this.user(req), dto.legalEntityId, dto.deviceRef.trim(), dto.reason.trim(), dto.punches);
  }
}
