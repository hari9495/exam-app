import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import type { ScopeUser } from '../access/scope';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PublicApplicationsThrottlerGuard } from '../public-applications/public-applications.throttler.guard';
import { STRICT_WALK_IN_THROTTLE } from '../rate-limit-tiers';
import { AcceptVisitDto, CheckInDto, FindPassDto, InviteVisitorDto, SaveVisitorSettingsDto } from './visitors-dto';
import { VisitorsService } from './visitors.service';

const who = (req: Request) => req.user as ScopeUser;
const day = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);

// Visitors slice 1 (M02 §B11). Hosts: any signed-in person of the company (their own invites). Reception:
// visitors.desk.manage at the location. Log: visitors.log.view or the desk key there. Settings 3.12:
// visitors.settings.manage or org.settings.manage. The service checks the location reach and refuses changes while acting.
@Controller('visitors')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class VisitorsController {
  constructor(private readonly visitors: VisitorsService) {}

  @Get('options')
  options(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.visitors.options(ctx, who(req));
  }

  @Get('mine')
  mine(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.visitors.mine(ctx, who(req));
  }

  @Post('invites')
  invite(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: InviteVisitorDto) {
    return this.visitors.invite(ctx, who(req), dto);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.visitors.cancel(ctx, who(req), id);
  }

  @Get('desk')
  @RequireAnyPermission('visitors.desk.manage')
  desk(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query('locationId', ParseUUIDPipe) locationId: string) {
    return this.visitors.desk(ctx, who(req), locationId);
  }

  @Post('desk/find')
  @HttpCode(200)
  @RequireAnyPermission('visitors.desk.manage')
  find(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: FindPassDto) {
    return this.visitors.findPass(ctx, who(req), dto);
  }

  @Post(':id/check-in')
  @HttpCode(200)
  @RequireAnyPermission('visitors.desk.manage')
  checkIn(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CheckInDto) {
    return this.visitors.checkIn(ctx, who(req), id, dto);
  }

  @Post(':id/check-out')
  @HttpCode(200)
  @RequireAnyPermission('visitors.desk.manage')
  checkOut(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.visitors.checkOut(ctx, who(req), id);
  }

  @Get('log')
  @RequireAnyPermission('visitors.log.view', 'visitors.desk.manage')
  log(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query('locationId') locationId?: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.visitors.log(ctx, who(req), { locationId: locationId || undefined, from: day(from), to: day(to) });
  }

  @Get('log.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="visitor-log.csv"')
  @RequireAnyPermission('visitors.log.view', 'visitors.desk.manage')
  logCsv(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query('locationId') locationId?: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.visitors.logCsv(ctx, who(req), { locationId: locationId || undefined, from: day(from), to: day(to) });
  }

  @Get('settings')
  @RequireAnyPermission('visitors.settings.manage', 'org.settings.manage', 'visitors.desk.manage')
  readSettings(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.visitors.readSettings(ctx, who(req));
  }

  @Put('settings')
  @RequireAnyPermission('visitors.settings.manage', 'org.settings.manage')
  saveSettings(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: SaveVisitorSettingsDto) {
    return this.visitors.saveSettings(ctx, who(req), dto.changes);
  }
}

// T9-14: the visitor's own page, by the unguessable link in the invite. Rate-limited per link (fail closed), on top of
// the app-wide per-address limit.
@Controller('public/visits')
@UseGuards(PublicApplicationsThrottlerGuard)
@Throttle(STRICT_WALK_IN_THROTTLE)
export class PublicVisitsController {
  constructor(private readonly visitors: VisitorsService) {}

  @Get(':token')
  get(@Param('token') token: string) {
    return this.visitors.publicVisit(token);
  }

  @Post(':token/accept')
  @HttpCode(200)
  accept(@Param('token') token: string, @Body() dto: AcceptVisitDto) {
    return this.visitors.acceptVisit(token, dto);
  }
}
