import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import type { ScopeUser } from '../access/scope';
import { CommentDto, CycleDto, DecideDisagreementDto, DisagreeDto, EntryDto, OtherReviewerDto, OverrideDto, ReasonDto, ReviewListDto } from './review-dto';
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
    return this.svc.list(ctx, this.user(req), q.view, q.cycle, q.legalEntityId);
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

  @Post('reviews/:id/skip/agree')
  @HttpCode(200)
  skipAgree(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CommentDto) {
    return this.svc.skipDecide(ctx, this.user(req), id, true, dto.comment ?? null);
  }

  @Post('reviews/:id/send-back')
  @HttpCode(200)
  sendBack(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.svc.skipDecide(ctx, this.user(req), id, false, dto.reason);
  }

  @Post('cycles/:id/release')
  @HttpCode(200)
  @RequirePermissions('perf.cycle.manage')
  release(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.release(ctx, this.user(req), id);
  }

  @Post('reviews/:id/acknowledge')
  @HttpCode(200)
  acknowledge(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CommentDto) {
    return this.svc.acknowledge(ctx, this.user(req), id, dto.comment ?? null);
  }

  @Post('reviews/:id/disagree')
  @HttpCode(200)
  disagree(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DisagreeDto) {
    return this.svc.disagree(ctx, this.user(req), id, dto.text);
  }

  @Get('cycles/:id/disagreements')
  @RequirePermissions('perf.cycle.manage')
  disagreements(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.disagreements(ctx, this.user(req), id);
  }

  @Post('disagreements/:id/decide')
  @HttpCode(200)
  @RequirePermissions('perf.cycle.manage')
  decideDisagreement(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideDisagreementDto) {
    return this.svc.decideDisagreement(ctx, this.user(req), id, dto);
  }

  @Post('reviews/:id/reopen')
  @HttpCode(200)
  @RequirePermissions('perf.cycle.manage')
  reopen(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.svc.reopen(ctx, this.user(req), id, dto.reason);
  }

  @Get('handovers')
  handovers(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.svc.handovers(ctx, this.user(req));
  }

  @Post('reviews/:id/other-reviewers')
  @HttpCode(200)
  @RequirePermissions('perf.cycle.manage')
  addOther(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: OtherReviewerDto) {
    return this.svc.addOther(ctx, this.user(req), id, dto.employeeId);
  }

  @Put('reviews/:id/entries/other')
  saveOther(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EntryDto) {
    return this.svc.saveOther(ctx, this.user(req), id, dto, false);
  }

  @Post('reviews/:id/entries/other/submit')
  @HttpCode(200)
  submitOther(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EntryDto) {
    return this.svc.saveOther(ctx, this.user(req), id, dto, true);
  }
}
