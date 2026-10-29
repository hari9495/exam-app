import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { MODERATE_UPLOAD_THROTTLE } from '../rate-limit-tiers';
import type { ScopeUser } from '../access/scope';
import { LeaveService } from './leave.service';
import { LeaveV2Service } from './leave-v2.service';
import { ApplyLeaveDto } from './dto';
import { BlockDateDto, BlockPlanDto, CompOffClaimDto, DateNoteDto, EncashDto, FeedDecideDto, FeedDto, LongAbsenceCheckDto, LongAbsenceDto, PauseDto, ReportQueryDto } from './leave-v2.dto';

// Leave v2 routes. Permissions (P02 YX-SEC-01), checked on the server for every row:
//   no key (self)              my ledger, comp-off claims, encashment, my long absence and its return date
//   implicit manager view      block-leave planner rows of their team (read only)
//   leave.view                 HR leave home, leave reports and export, long absences, block-leave planning and nudges
//   leave.balance.adjust       record, extend or end a long absence early; apply leave for someone (never one's own)
//   + employee.salary.view     the money columns of the leave liability report (per legal entity; others get days only)
//   leave.settings.manage      company block dates and public-holiday feeds
// Acting for someone else is refused on every write.
@Controller('time')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LeaveV2Controller {
  constructor(
    private readonly leave: LeaveService,
    private readonly v2: LeaveV2Service,
  ) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  // ------------------------------------------------------------------------------------------ me

  @Get('me/leave/ledger')
  myLedger(@CurrentTenant() ctx: TenantContext) {
    return this.leave.myLedger(ctx);
  }

  @Get('me/comp-off')
  myCompOff(@CurrentTenant() ctx: TenantContext) {
    return this.v2.myCompOff(ctx);
  }

  @Post('me/comp-off')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  claim(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: CompOffClaimDto) {
    return this.v2.claimCompOff(ctx, this.user(req), dto);
  }

  @Post('me/comp-off/:id/withdraw')
  @HttpCode(200)
  withdrawClaim(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.v2.withdrawClaim(ctx, this.user(req), id);
  }

  @Get('me/encashment')
  myEncashment(@CurrentTenant() ctx: TenantContext) {
    return this.v2.myEncashment(ctx);
  }

  @Post('me/encashment')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  encash(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: EncashDto) {
    return this.v2.encash(ctx, this.user(req), dto);
  }

  @Post('me/encashment/:id/withdraw')
  @HttpCode(200)
  withdrawEncash(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.v2.withdrawEncash(ctx, this.user(req), id);
  }

  @Get('me/long-absence')
  myAbsence(@CurrentTenant() ctx: TenantContext) {
    return this.v2.myAbsence(ctx);
  }

  @Post('me/long-absence/:id/return-date')
  @HttpCode(200)
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  askReturn(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DateNoteDto) {
    return this.v2.askReturnDate(ctx, this.user(req), id, dto);
  }

  // ------------------------------------------------------------------------------------------ HR

  @Get('hr/leave-home')
  @RequirePermissions('leave.view')
  hrHome(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.v2.hrHome(ctx, this.user(req));
  }

  @Post('hr/leave-home/remind/:requestId')
  @HttpCode(200)
  @RequirePermissions('leave.view')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  remind(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('requestId', ParseUUIDPipe) id: string) {
    return this.v2.remindApprovers(ctx, this.user(req), id);
  }

  @Get('hr/leave-report')
  @RequirePermissions('leave.view')
  report(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: ReportQueryDto) {
    return this.v2.report(ctx, this.user(req), q);
  }

  @Get('hr/leave-report/export')
  @RequirePermissions('leave.view')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  @Header('Cache-Control', 'no-store')
  async export(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: ReportQueryDto, @Res({ passthrough: true }) res: Response) {
    const out = await this.v2.export(ctx, this.user(req), q);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
    return `﻿${out.csv}`;
  }

  /** Founder decision 2: HR applies leave for someone in scope; notice follows leave.notice.on_behalf (skip by default). */
  @Post('hr/leave/:employeeId')
  @RequirePermissions('leave.balance.adjust')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  applyFor(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('employeeId', ParseUUIDPipe) id: string, @Body() dto: ApplyLeaveDto) {
    return this.leave.applyFor(ctx, this.user(req), id, dto);
  }

  @Get('hr/long-absences')
  @RequirePermissions('leave.view')
  absences(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.v2.hrAbsences(ctx, this.user(req));
  }

  @Get('hr/long-absences/check')
  @RequirePermissions('leave.balance.adjust')
  checkAbsence(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: LongAbsenceCheckDto) {
    return this.v2.checkAbsence(ctx, this.user(req), q);
  }

  @Post('hr/long-absences')
  @RequirePermissions('leave.balance.adjust')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  recordAbsence(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: LongAbsenceDto) {
    return this.v2.recordAbsence(ctx, this.user(req), dto);
  }

  @Post('hr/long-absences/:id/extend')
  @HttpCode(200)
  @RequirePermissions('leave.balance.adjust')
  extend(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DateNoteDto) {
    return this.v2.changeAbsence(ctx, this.user(req), id, 'extend', dto);
  }

  @Post('hr/long-absences/:id/early-return')
  @HttpCode(200)
  @RequirePermissions('leave.balance.adjust')
  earlyReturn(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DateNoteDto) {
    return this.v2.changeAbsence(ctx, this.user(req), id, 'early', dto);
  }

  /** Managers see their team's rows read only; planning needs leave.view in scope. */
  @Get('hr/block-leave')
  blockLeave(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.v2.blockLeave(ctx, this.user(req));
  }

  @Post('hr/block-leave/:employeeId/plan')
  @HttpCode(200)
  @RequirePermissions('leave.view')
  planBlock(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('employeeId', ParseUUIDPipe) id: string, @Body() dto: BlockPlanDto) {
    return this.v2.planBlock(ctx, this.user(req), id, dto);
  }

  @Post('hr/block-leave/:employeeId/nudge')
  @HttpCode(200)
  @RequirePermissions('leave.view')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  nudgeBlock(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('employeeId', ParseUUIDPipe) id: string) {
    return this.v2.nudgeBlock(ctx, this.user(req), id);
  }

  @Post('hr/block-leave/:employeeId/pause')
  @HttpCode(200)
  @RequirePermissions('leave.view')
  pauseBlock(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('employeeId', ParseUUIDPipe) id: string, @Body() dto: PauseDto) {
    return this.v2.pauseBlock(ctx, this.user(req), id, dto.pause);
  }

  // ------------------------------------------------------------------------------------------ set-up

  @Get('setup/block-dates')
  @RequirePermissions('leave.settings.manage')
  blockDates(@CurrentTenant() ctx: TenantContext) {
    return this.v2.listBlockDates(ctx);
  }

  @Post('setup/block-dates')
  @RequirePermissions('leave.settings.manage')
  addBlockDate(@CurrentTenant() ctx: TenantContext, @Body() dto: BlockDateDto) {
    return this.v2.addBlockDate(ctx, dto);
  }

  @Post('setup/block-dates/:id/remove')
  @HttpCode(200)
  @RequirePermissions('leave.settings.manage')
  removeBlockDate(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.v2.removeBlockDate(ctx, id);
  }

  @Get('setup/holiday-feeds')
  @RequirePermissions('leave.settings.manage')
  feeds(@CurrentTenant() ctx: TenantContext) {
    return this.v2.feeds(ctx);
  }

  @Post('setup/holiday-feeds')
  @RequirePermissions('leave.settings.manage')
  addFeed(@CurrentTenant() ctx: TenantContext, @Body() dto: FeedDto) {
    return this.v2.addFeed(ctx, dto.state);
  }

  @Post('setup/holiday-feeds/check')
  @HttpCode(200)
  @RequirePermissions('leave.settings.manage')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  checkFeeds(@CurrentTenant() ctx: TenantContext) {
    return this.v2.checkFeeds(ctx);
  }

  @Post('setup/holiday-feeds/decide')
  @HttpCode(200)
  @RequirePermissions('leave.settings.manage')
  decideFeed(@CurrentTenant() ctx: TenantContext, @Body() dto: FeedDecideDto) {
    return this.v2.decideFeed(ctx, dto);
  }

  @Post('setup/holiday-feeds/:id/remove')
  @HttpCode(200)
  @RequirePermissions('leave.settings.manage')
  removeFeed(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.v2.removeFeed(ctx, id);
  }
}
