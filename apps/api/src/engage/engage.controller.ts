import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { assertOwnSession } from '../service-desk/desk-access';
import type { ScopeUser } from '../access/scope';
import { AnnouncementDto, AudienceDto } from './dto';
import { AnnouncementsService } from './announcements.service';

// Batch G2 (M09 Engage). Keys (P02 YX-SEC-01):
//   engage.announce   write, publish and track announcements (held for the whole company)
//   no key (self)     the feed: my announcements; acknowledging one (never while acting for someone else)
@Controller('engage/announcements')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AnnouncementsController {
  constructor(private readonly svc: AnnouncementsService) {}

  @Get()
  @RequirePermissions('engage.announce')
  async list(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    await this.svc.companyWide(req.user as ScopeUser);
    return this.svc.list(ctx);
  }

  @Get('options')
  @RequirePermissions('engage.announce')
  async options(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    await this.svc.companyWide(req.user as ScopeUser);
    return this.svc.options(ctx);
  }

  @Post('reach')
  @HttpCode(200)
  @RequirePermissions('engage.announce')
  async reach(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: AudienceDto) {
    await this.svc.companyWide(req.user as ScopeUser);
    return this.svc.reach(ctx, dto);
  }

  @Post()
  @RequirePermissions('engage.announce')
  async create(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: AnnouncementDto) {
    assertOwnSession(req);
    await this.svc.companyWide(req.user as ScopeUser);
    return this.svc.create(ctx, dto);
  }

  @Get(':id')
  @RequirePermissions('engage.announce')
  async detail(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.svc.companyWide(req.user as ScopeUser);
    return this.svc.detail(ctx, id);
  }

  @Post(':id/remind')
  @RequirePermissions('engage.announce')
  async remind(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    await this.svc.companyWide(req.user as ScopeUser);
    return this.svc.remind(ctx, id);
  }
}

@Controller('engage/my')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MyEngageController {
  constructor(private readonly svc: AnnouncementsService) {}

  @Get('announcements')
  announcements(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.svc.mine(ctx, req.user as ScopeUser);
  }

  @Post('announcements/:id/acknowledge')
  acknowledge(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.svc.acknowledge(ctx, req.user as ScopeUser, id);
  }
}
