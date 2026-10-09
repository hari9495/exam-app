import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { RequireStepUp } from '../auth/step-up.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { MODERATE_UPLOAD_THROTTLE, STRICT_AUTH_THROTTLE } from '../rate-limit-tiers';
import type { ScopeUser } from '../access/scope';
import {
  ActiveDto,
  ConsentDto,
  EligibilityOverrideDto,
  MonthQueryDto,
  NightConfirmDto,
  NightOptInDto,
  OtClaimDto,
  OtRuleDto,
  OverrideDto,
  PatternAssignDto,
  PatternDto,
  PeriodDto,
  ProjectDto,
  RegisterQueryDto,
  RosterCellsDto,
  RosterCopyDto,
  SafeguardDto,
  ShiftDetailsDto,
  ShiftDto,
  ShiftTimesDto,
  SwapDto,
  TimesheetDto,
  UnlockDto,
  WeekQueryDto,
  WithdrawConsentDto,
  YearQueryDto,
} from './dto';
import { LeaveService } from './leave.service';
import { NightWorkService } from './night-work.service';
import { OvertimeService } from './overtime.service';
import { PeriodsService } from './periods.service';
import { RosterService } from './roster.service';
import { TimesheetService } from './timesheet.service';

// M02 Time and leave, batch 2. Permissions (P02 YX-SEC-01), checked again in the services:
//   no key (self)                  my shifts and swaps, my overtime claims, my timesheet, my night-work protection
//                                  and consents (opt-in, confirm with a one-time code, withdraw)
//   implicit (YX-SEC-04)           a manager plans and publishes their team's roster and sees its overtime
//   roster.manage                  HR plans and publishes rosters of the people in scope
//   leave.settings.manage          company-wide set-up: shifts, patterns, OT rules, projects, night-work records
//   leave.approve                  HR overrides an OT limit with a reason (never one's own)
//   leave.eligibility.override     HR lets a person through a leave eligibility check with a reason
//   attendance.view                HR: overtime review, the payroll feed preview and the registers of people in scope
//   attendance.lock (+ step-up)    lock / unlock an attendance month of a legal entity in scope
// Approvals run through the shared P03 inbox (/workflow/approvals).
@Controller('time')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TimeOpsController {
  constructor(
    private readonly roster: RosterService,
    private readonly overtime: OvertimeService,
    private readonly timesheets: TimesheetService,
    private readonly periods: PeriodsService,
    private readonly leave: LeaveService,
    private readonly night: NightWorkService,
  ) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  // ------------------------------------------------------------------------------------------ set-up (company-wide)

  @Get('shifts/setup')
  @RequirePermissions('leave.settings.manage')
  shiftSetup(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.roster.overview(ctx, this.user(req));
  }

  @Post('shifts')
  @RequirePermissions('leave.settings.manage')
  createShift(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ShiftDto) {
    return this.roster.createShift(ctx, this.user(req), dto);
  }

  @Put('shifts/:id')
  @RequirePermissions('leave.settings.manage')
  updateShift(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ShiftDetailsDto) {
    return this.roster.updateShift(ctx, this.user(req), id, dto);
  }

  @Post('shifts/:id/versions')
  @RequirePermissions('leave.settings.manage')
  shiftVersion(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ShiftTimesDto) {
    return this.roster.addShiftVersion(ctx, this.user(req), id, dto);
  }

  @Post('patterns')
  @RequirePermissions('leave.settings.manage')
  createPattern(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: PatternDto) {
    return this.roster.createPattern(ctx, this.user(req), dto);
  }

  @Post('patterns/:id/active')
  @HttpCode(200)
  @RequirePermissions('leave.settings.manage')
  patternActive(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ActiveDto) {
    return this.roster.setPatternActive(ctx, this.user(req), id, dto.active);
  }

  @Post('patterns/:id/assign')
  @RequirePermissions('leave.settings.manage')
  assignPattern(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PatternAssignDto) {
    return this.roster.assignPattern(ctx, this.user(req), id, dto);
  }

  @Post('pattern-assignments/:id/remove')
  @HttpCode(200)
  @RequirePermissions('leave.settings.manage')
  removePatternAssignment(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.roster.removePatternAssignment(ctx, this.user(req), id);
  }

  @Post('ot-rules')
  @RequirePermissions('leave.settings.manage')
  createOtRule(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: OtRuleDto) {
    return this.overtime.createRule(ctx, this.user(req), dto);
  }

  @Post('ot-rules/:id/remove')
  @HttpCode(200)
  @RequirePermissions('leave.settings.manage')
  removeOtRule(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.overtime.removeRule(ctx, this.user(req), id);
  }

  @Post('projects')
  @RequirePermissions('leave.settings.manage')
  createProject(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ProjectDto) {
    return this.timesheets.createProject(ctx, this.user(req), dto);
  }

  @Put('projects/:id')
  @RequirePermissions('leave.settings.manage')
  updateProject(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ProjectDto) {
    return this.timesheets.updateProject(ctx, this.user(req), id, dto);
  }

  @Post('night/consents')
  @RequirePermissions('leave.settings.manage')
  addConsent(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ConsentDto) {
    return this.roster.addConsent(ctx, this.user(req), dto);
  }

  @Post('night/consents/:id/withdraw')
  @HttpCode(200)
  @RequirePermissions('leave.settings.manage')
  withdrawConsent(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: WithdrawConsentDto) {
    return this.roster.withdrawConsent(ctx, this.user(req), id, dto.on);
  }

  @Post('night/safeguards')
  @RequirePermissions('leave.settings.manage')
  attest(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: SafeguardDto) {
    return this.roster.attestSafeguard(ctx, this.user(req), dto);
  }

  // ------------------------------------------------------------------------------------------ roster (team / roster.manage)

  @Get('roster')
  rosterWeek(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: WeekQueryDto) {
    return this.roster.roster(ctx, this.user(req), q.week);
  }

  @Put('roster/cells')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  rosterCells(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: RosterCellsDto) {
    return this.roster.setCells(ctx, this.user(req), dto.cells);
  }

  @Post('roster/copy')
  @HttpCode(200)
  rosterCopy(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: RosterCopyDto) {
    return this.roster.copyWeek(ctx, this.user(req), dto.fromWeek, dto.toWeek);
  }

  @Post('roster/publish')
  @HttpCode(200)
  rosterPublish(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: WeekQueryDto) {
    return this.roster.publish(ctx, this.user(req), dto.week);
  }

  // ------------------------------------------------------------------------------------------ me

  // Founder decisions 9 Oct 2026: the night-work opt-in (only the person turns it off) and the worker's own
  // confirmation (one-time code) and withdrawal of a consent HR recorded.
  @Get('me/night-work')
  myNightWork(@CurrentTenant() ctx: TenantContext) {
    return this.night.me(ctx);
  }

  @Put('me/night-work/opt-in')
  nightOptIn(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: NightOptInDto) {
    return this.night.setOptIn(ctx, this.user(req), dto.optIn);
  }

  @Post('me/night-consents/:id/code')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  nightCode(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.night.sendCode(ctx, this.user(req), id, req.ip ?? null);
  }

  @Post('me/night-consents/:id/confirm')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  nightConfirm(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NightConfirmDto) {
    return this.night.confirm(ctx, this.user(req), id, dto.code);
  }

  @Post('me/night-consents/:id/withdraw')
  @HttpCode(200)
  nightWithdraw(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.night.withdraw(ctx, this.user(req), id);
  }

  @Get('me/shifts')
  myShifts(@CurrentTenant() ctx: TenantContext, @Query() q: WeekQueryDto) {
    return this.roster.mine(ctx, q.week);
  }

  @Post('me/swaps')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  swap(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: SwapDto) {
    return this.roster.requestSwap(ctx, this.user(req), dto);
  }

  @Post('me/swaps/:id/withdraw')
  @HttpCode(200)
  withdrawSwap(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.roster.withdrawSwap(ctx, this.user(req), id);
  }

  @Get('me/overtime')
  myOvertime(@CurrentTenant() ctx: TenantContext) {
    return this.overtime.me(ctx);
  }

  @Post('me/overtime')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  claim(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: OtClaimDto) {
    return this.overtime.claim(ctx, this.user(req), dto);
  }

  @Post('me/overtime/:id/withdraw')
  @HttpCode(200)
  withdrawClaim(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.overtime.withdraw(ctx, this.user(req), id);
  }

  @Get('me/timesheet')
  myWeek(@CurrentTenant() ctx: TenantContext, @Query() q: WeekQueryDto) {
    return this.timesheets.week(ctx, q.week);
  }

  @Put('me/timesheet')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  saveWeek(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: TimesheetDto) {
    return this.timesheets.save(ctx, this.user(req), dto.week, dto.lines);
  }

  @Post('me/timesheet/submit')
  @HttpCode(200)
  submitWeek(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: WeekQueryDto) {
    return this.timesheets.submit(ctx, this.user(req), dto.week);
  }

  @Post('me/timesheet/:id/withdraw')
  @HttpCode(200)
  withdrawWeek(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.timesheets.withdraw(ctx, this.user(req), id);
  }

  // ------------------------------------------------------------------------------------------ team and HR

  @Get('overtime')
  otReview(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: MonthQueryDto) {
    return this.overtime.review(ctx, this.user(req), q.month);
  }

  @Post('overtime/:id/override')
  @HttpCode(200)
  @RequirePermissions('leave.approve')
  otOverride(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: OverrideDto) {
    return this.overtime.override(ctx, this.user(req), id, dto.reason);
  }

  @Post('people/:employeeId/eligibility-override')
  @RequirePermissions('leave.eligibility.override')
  eligibility(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('employeeId', ParseUUIDPipe) employeeId: string, @Body() dto: EligibilityOverrideDto) {
    return this.leave.overrideEligibility(ctx, this.user(req), employeeId, dto);
  }

  @Get('periods')
  @RequirePermissions('attendance.lock')
  periodsOf(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: YearQueryDto) {
    return this.periods.periods(ctx, this.user(req), q.year);
  }

  @Get('periods/preflight')
  @RequirePermissions('attendance.lock')
  preflight(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: PeriodDto) {
    return this.periods.preflight(ctx, this.user(req), q.legalEntityId, q.month);
  }

  @Post('periods/lock')
  @HttpCode(200)
  @RequirePermissions('attendance.lock')
  @RequireStepUp()
  lock(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: PeriodDto) {
    return this.periods.lock(ctx, this.user(req), dto.legalEntityId, dto.month);
  }

  @Post('periods/unlock')
  @HttpCode(200)
  @RequirePermissions('attendance.lock')
  @RequireStepUp()
  unlock(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: UnlockDto) {
    return this.periods.unlock(ctx, this.user(req), dto.legalEntityId, dto.month, dto.reason);
  }

  @Get('payroll-feed')
  @RequirePermissions('attendance.view')
  feed(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: PeriodDto) {
    return this.periods.feed(ctx, this.user(req), q.legalEntityId, q.month);
  }

  @Get('registers')
  @RequirePermissions('attendance.view')
  registers(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: MonthQueryDto) {
    return this.periods.registers(ctx, this.user(req), q.month);
  }

  @Get('registers/:type/export')
  @RequirePermissions('attendance.view')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  async exportRegister(@Req() req: Request, @Res({ passthrough: true }) res: Response, @CurrentTenant() ctx: TenantContext, @Param('type') type: string, @Query() q: RegisterQueryDto): Promise<StreamableFile> {
    const out = await this.periods.exportRegister(ctx, this.user(req), type === 'leave' ? 'leave' : 'muster', q.locationId, q.month, q.format);
    res.set({ 'Content-Type': out.contentType, 'Content-Disposition': `attachment; filename="${out.name.replace(/[^A-Za-z0-9._-]/g, '_')}"`, 'Cache-Control': 'no-store' });
    return new StreamableFile(out.file);
  }
}
