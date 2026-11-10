import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { TenantContext } from '@exam-platform/shared';
import type { ScopeUser } from '../access/scope';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PublicApplicationsThrottlerGuard } from '../public-applications/public-applications.throttler.guard';
import { MODERATE_UPLOAD_THROTTLE, STRICT_WALK_IN_THROTTLE } from '../rate-limit-tiers';
import { AcceptVisitDto, AddWatchDto, CheckInDto, FindPassDto, IdImageDto, InviteVisitorDto, SaveVisitorSettingsDto } from './visitors-dto';
import { VisitorWatchlistService } from './visitor-watchlist.service';
import { VisitorsService } from './visitors.service';

const who = (req: Request) => req.user as ScopeUser;
const UPLOAD = FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
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

  /** Answer 603: the photo of the ID where the location keeps one (reception, before check-in). */
  @Post(':id/id-image')
  @HttpCode(200)
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  @RequireAnyPermission('visitors.desk.manage')
  @UseInterceptors(UPLOAD)
  idImage(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: IdImageDto, @UploadedFile() file: Express.Multer.File | undefined) {
    return this.visitors.addIdImage(ctx, who(req), id, dto, file ? { name: file.originalname, data: file.buffer } : null);
  }

  @Get(':id/id-image')
  @RequireAnyPermission('visitors.desk.manage', 'visitors.log.view')
  async openIdImage(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const f = await this.visitors.idImage(ctx, who(req), id);
    res.set({ 'Content-Type': f.contentType, 'Content-Disposition': `inline; filename="${f.name.replace(/[^A-Za-z0-9._-]/g, '_')}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
    return new StreamableFile(f.file);
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

// Answer 605: the blocked-visitor watch-list (visitors.watchlist.manage for the whole company; the service checks the
// reach and refuses changes while acting).
@Controller('visitors/watchlist')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequireAnyPermission('visitors.watchlist.manage')
export class VisitorWatchlistController {
  constructor(private readonly watchlist: VisitorWatchlistService) {}

  @Get()
  list(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.watchlist.list(ctx, who(req));
  }

  @Post()
  add(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: AddWatchDto) {
    return this.watchlist.add(ctx, who(req), dto);
  }

  @Post(':id/review')
  @HttpCode(200)
  review(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.watchlist.review(ctx, who(req), id);
  }

  @Delete(':id')
  remove(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.watchlist.remove(ctx, who(req), id);
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
