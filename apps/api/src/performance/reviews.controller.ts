import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import type { ScopeUser } from '../access/scope';
import { CycleDto, EntryDto, OverrideDto, ReviewListDto } from './review-dto';
import { VersionDto } from './dto';
import { PerformanceReviewsService } from './reviews.service';

// Performance batch PM4 (M06-BUILD-DESIGN §19 "Cycles", "Reviews"). Cycles need perf.cycle.manage; reviews are open to
// the implicit grants (the person, their manager and the chain above) and perf.review.view; the service decides per review.
@Controller('performance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PerformanceReviewsController {
  constructor(private readonly svc: PerformanceReviewsService) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  @Get('cycles')
  @RequirePermissions('perf.cycle.manage')
  cycles(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.svc.cycles(ctx, this.user(req));
  }

  @Get('cycle-templates')
  @RequirePermissions('perf.cycle.manage')
  templates(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.svc.templateChoices(ctx, this.user(req));
  }

  @Get('cycles/:id')
  @RequirePermissions('perf.cycle.manage')
  cycle(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.cycle(ctx, this.user(req), id);
  }

  @Post('cycles')
  @RequirePermissions('perf.cycle.manage')
  create(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: CycleDto) {
    return this.svc.saveCycle(ctx, this.user(req), null, dto);
  }

  @Put('cycles/:id')
  @RequirePermissions('perf.cycle.manage')
  update(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CycleDto) {
    return this.svc.saveCycle(ctx, this.user(req), id, dto);
  }

  @Post('cycles/:id/preflight')
  @HttpCode(200)
  @RequirePermissions('perf.cycle.manage')
  preflight(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.preflight(ctx, this.user(req), id);
  }

  @Post('cycles/:id/launch')
  @HttpCode(200)
  @RequirePermissions('perf.cycle.manage')
  launch(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VersionDto) {
    return this.svc.launch(ctx, this.user(req), id, dto.version);
  }

  @Get('cycles/:id/eligibility')
  @RequirePermissions('perf.cycle.manage')
  eligibility(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.eligibility(ctx, this.user(req), id);
  }

  @Get('cycles/:id/funnel')
  @RequirePermissions('perf.cycle.manage')
  funnel(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.funnel(ctx, this.user(req), id);
  }

  @Put('eligibility/:id')
  @RequirePermissions('perf.cycle.manage')
  override(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: OverrideDto) {
    return this.svc.override(ctx, this.user(req), id, dto);
  }

  @Get('reviews')
  list(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: ReviewListDto) {
    return this.svc.list(ctx, this.user(req), q.view, q.cycle);
  }

  @Get('reviews/:id')
  get(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.get(ctx, this.user(req), id);
  }

  @Put('reviews/:id/entries/self')
  saveSelf(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EntryDto) {
    return this.svc.saveEntry(ctx, this.user(req), id, 'self', dto, false);
  }

  @Post('reviews/:id/entries/self/submit')
  @HttpCode(200)
  submitSelf(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EntryDto) {
    return this.svc.saveEntry(ctx, this.user(req), id, 'self', dto, true);
  }

  @Put('reviews/:id/entries/manager')
  saveManager(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EntryDto) {
    return this.svc.saveEntry(ctx, this.user(req), id, 'manager', dto, false);
  }

  @Post('reviews/:id/entries/manager/submit')
  @HttpCode(200)
  submitManager(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EntryDto) {
    return this.svc.saveEntry(ctx, this.user(req), id, 'manager', dto, true);
  }
}
