import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { MODERATE_UPLOAD_THROTTLE } from '../rate-limit-tiers';
import type { ScopeUser } from '../access/scope';
import { AwardDto, CallOutDto, CancelOpenShiftDto, MoveShiftDto, OpenShiftDto, OpenShiftQueryDto, SlotDto, StandbyQueryDto } from './roster-extras.dto';
import { OpenShiftsService } from './open-shifts.service';
import { StandbyService } from './standby.service';

// TIM-35 Open shifts and bids, TIM-38 Standby and call-out. No route key: every check is in the services.
//   planner (a manager's own team, or roster.manage in scope; never one's own row; not while acting for someone):
//     GET /time/open-shifts, POST /time/open-shifts, /:id/award, /:id/cancel
//     GET /time/standby, POST /time/standby/slots, /slots/:id/cancel, /call-outs, /move
//   the signed-in person only (not while acting for someone): GET /time/me/open-shifts, POST /time/me/open-shifts/:id/claim, /withdraw
@Controller('time')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RosterExtrasController {
  constructor(
    private readonly open: OpenShiftsService,
    private readonly standby: StandbyService,
  ) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  // ------------------------------------------------------------------------------------------ TIM-35 planner

  @Get('open-shifts')
  list(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: OpenShiftQueryDto) {
    return this.open.list(ctx, this.user(req), q.show);
  }

  @Post('open-shifts')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  offer(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: OpenShiftDto) {
    return this.open.offer(ctx, this.user(req), dto);
  }

  @Post('open-shifts/:id/award')
  @HttpCode(200)
  award(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AwardDto) {
    return this.open.award(ctx, this.user(req), id, dto);
  }

  @Post('open-shifts/:id/cancel')
  @HttpCode(200)
  cancel(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelOpenShiftDto) {
    return this.open.cancel(ctx, this.user(req), id, dto);
  }

  // ------------------------------------------------------------------------------------------ TIM-35 me

  @Get('me/open-shifts')
  mine(@CurrentTenant() ctx: TenantContext) {
    return this.open.mine(ctx);
  }

  @Post('me/open-shifts/:id/claim')
  @HttpCode(200)
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  claim(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.open.claim(ctx, this.user(req), id);
  }

  @Post('me/open-shifts/:id/withdraw')
  @HttpCode(200)
  withdraw(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.open.withdraw(ctx, this.user(req), id);
  }

  // ------------------------------------------------------------------------------------------ TIM-38

  @Get('standby')
  week(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: StandbyQueryDto) {
    return this.standby.week(ctx, this.user(req), q.week);
  }

  @Post('standby/slots')
  slot(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: SlotDto) {
    return this.standby.setSlot(ctx, this.user(req), dto);
  }

  @Post('standby/slots/:id/cancel')
  @HttpCode(200)
  cancelSlot(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.standby.cancelSlot(ctx, this.user(req), id);
  }

  @Post('standby/call-outs')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  callOut(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: CallOutDto) {
    return this.standby.logCallOut(ctx, this.user(req), dto);
  }

  @Post('standby/move')
  @HttpCode(200)
  move(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: MoveShiftDto) {
    return this.standby.moveShift(ctx, this.user(req), dto);
  }
}
