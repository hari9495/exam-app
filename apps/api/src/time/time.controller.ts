import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { MODERATE_UPLOAD_THROTTLE } from '../rate-limit-tiers';
import type { ScopeUser } from '../access/scope';
import { AttendanceService } from './attendance.service';
import { AdjustDto, ApplyLeaveDto, AssignPolicyDto, AttendanceRuleDto, CalendarDto, HolidayDto, LeavePlanDto, LeaveTypeDto, MonthQueryDto, PolicyDto, PolicyVersionDto, PunchDto, RangeQueryDto, ReasonDto, RegulariseDto, YearEndDto } from './dto';
import { LeaveService } from './leave.service';
import { TimeSetupService } from './setup.service';
import { TimeJobs } from './time-jobs';

// M02 Time and leave, batch 1. Permissions (P02 YX-SEC-01):
//   no key (self)              my leave, balances, apply / withdraw / cancel, optional holidays, my punches and fixes
//   implicit (YX-SEC-04)       a manager sees their team's leave calendar, muster and day cards (YX-AT-14)
//   leave.view                 HR: requests, balances, ledger and the calendar of the people in scope
//   leave.balance.adjust       HR: adjust a balance with a reason (never one's own)
//   leave.medical.view         HR: medical reasons (each read audited) and certificate verification (Special)
//   attendance.view            HR: muster and day cards of the people in scope
//   leave.settings.manage      company-wide set-up: types, policies, holidays, shifts, weekly offs, year end
// Approvals run through the shared P03 inbox (/workflow/approvals); approvers see only the summary chosen here.
@Controller('time')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TimeController {
  constructor(
    private readonly leave: LeaveService,
    private readonly attendance: AttendanceService,
    private readonly setup: TimeSetupService,
    private readonly jobs: TimeJobs,
  ) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  // ------------------------------------------------------------------------------------------ me › leave

  @Get('me/leave')
  myLeave(@CurrentTenant() ctx: TenantContext) {
    return this.leave.me(ctx);
  }

  @Post('me/leave/preview')
  @HttpCode(200)
  preview(@CurrentTenant() ctx: TenantContext, @Body() dto: LeavePlanDto) {
    return this.leave.preview(ctx, dto);
  }

  @Post('me/leave')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  apply(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ApplyLeaveDto) {
    return this.leave.apply(ctx, this.user(req), dto);
  }

  @Post('me/leave/:id/withdraw')
  @HttpCode(200)
  withdraw(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.leave.withdraw(ctx, this.user(req), id);
  }

  @Post('me/leave/:id/cancel')
  @HttpCode(200)
  cancel(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.leave.cancel(ctx, this.user(req), id, dto.reason);
  }

  @Post('me/holidays/:id/choose')
  @HttpCode(200)
  choose(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.leave.chooseHoliday(ctx, this.user(req), id, true);
  }

  @Post('me/holidays/:id/unchoose')
  @HttpCode(200)
  unchoose(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.leave.chooseHoliday(ctx, this.user(req), id, false);
  }

  // ------------------------------------------------------------------------------------------ me › attendance

  @Get('me/attendance')
  myAttendance(@CurrentTenant() ctx: TenantContext, @Query() q: MonthQueryDto) {
    return this.attendance.me(ctx, q.month);
  }

  @Post('me/punch')
  @HttpCode(200)
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  punch(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: PunchDto) {
    return this.attendance.punch(ctx, this.user(req), dto, req.ip ?? null, (req.headers['user-agent'] as string | undefined) ?? null);
  }

  @Post('me/regularise')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  regularise(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: RegulariseDto) {
    return this.attendance.regularise(ctx, this.user(req), dto);
  }

  @Post('me/regularise/:id/withdraw')
  @HttpCode(200)
  withdrawFix(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.attendance.withdraw(ctx, this.user(req), id);
  }

  // ------------------------------------------------------------------------------------------ team and HR

  @Get('team/calendar')
  calendar(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: RangeQueryDto) {
    return this.leave.teamCalendar(ctx, this.user(req), q.from, q.to);
  }

  @Get('requests/:id')
  request(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.leave.detail(ctx, this.user(req), id);
  }

  @Post('requests/:id/certificate/verify')
  @HttpCode(200)
  @RequirePermissions('leave.medical.view')
  verify(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.leave.verifyCertificate(ctx, this.user(req), id);
  }

  @Get('muster')
  muster(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: MonthQueryDto) {
    return this.attendance.muster(ctx, this.user(req), q.month);
  }

  @Get('people/:employeeId/days/:on')
  dayCard(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('employeeId', ParseUUIDPipe) employeeId: string, @Param('on') on: string) {
    return this.attendance.dayCard(ctx, this.user(req), employeeId, /^\d{4}-\d{2}-\d{2}$/.test(on) ? on : '0000-00-00');
  }

  @Get('hr/balances')
  @RequirePermissions('leave.view')
  balances(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.leave.hrBalances(ctx, this.user(req));
  }

  @Get('people/:employeeId/ledger')
  ledger(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return this.leave.ledger(ctx, this.user(req), employeeId);
  }

  @Post('people/:employeeId/adjust')
  @RequirePermissions('leave.balance.adjust')
  adjust(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('employeeId', ParseUUIDPipe) employeeId: string, @Body() dto: AdjustDto) {
    return this.leave.adjust(ctx, this.user(req), employeeId, dto);
  }

  // ------------------------------------------------------------------------------------------ set-up (company-wide)

  @Get('setup')
  @RequirePermissions('leave.settings.manage')
  overview(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.setup.overview(ctx, this.user(req));
  }

  @Post('setup/types')
  @RequirePermissions('leave.settings.manage')
  createType(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: LeaveTypeDto) {
    return this.setup.createType(ctx, this.user(req), dto);
  }

  @Put('setup/types/:id')
  @RequirePermissions('leave.settings.manage')
  updateType(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LeaveTypeDto) {
    return this.setup.updateType(ctx, this.user(req), id, dto);
  }

  @Post('setup/policies')
  @RequirePermissions('leave.settings.manage')
  createPolicy(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: PolicyDto) {
    return this.setup.createPolicy(ctx, this.user(req), dto);
  }

  @Post('setup/policies/:id/versions')
  @RequirePermissions('leave.settings.manage')
  addVersion(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PolicyVersionDto) {
    return this.setup.addVersion(ctx, this.user(req), id, dto);
  }

  @Post('setup/policies/:id/assign')
  @RequirePermissions('leave.settings.manage')
  assign(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignPolicyDto) {
    return this.setup.assign(ctx, this.user(req), id, dto);
  }

  @Post('setup/assignments/:id/remove')
  @HttpCode(200)
  @RequirePermissions('leave.settings.manage')
  removeAssignment(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.setup.removeAssignment(ctx, this.user(req), id);
  }

  @Post('setup/calendars')
  @RequirePermissions('leave.settings.manage')
  createCalendar(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: CalendarDto) {
    return this.setup.createCalendar(ctx, this.user(req), dto);
  }

  @Put('setup/calendars/:id')
  @RequirePermissions('leave.settings.manage')
  updateCalendar(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CalendarDto) {
    return this.setup.updateCalendar(ctx, this.user(req), id, dto);
  }

  @Post('setup/calendars/:id/holidays')
  @RequirePermissions('leave.settings.manage')
  addHoliday(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: HolidayDto) {
    return this.setup.addHoliday(ctx, this.user(req), id, dto);
  }

  @Post('setup/holidays/:id/remove')
  @HttpCode(200)
  @RequirePermissions('leave.settings.manage')
  removeHoliday(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.setup.removeHoliday(ctx, this.user(req), id);
  }

  @Post('setup/locations/:id/rule')
  @RequirePermissions('leave.settings.manage')
  setRule(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AttendanceRuleDto) {
    return this.setup.setRule(ctx, this.user(req), id, dto);
  }

  @Get('setup/year-end')
  @RequirePermissions('leave.settings.manage')
  yearEnd(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: YearEndDto) {
    return this.setup.yearEndPreview(ctx, this.user(req), q.yearEnd);
  }

  @Post('setup/year-end')
  @HttpCode(202)
  @RequirePermissions('leave.settings.manage')
  async runYearEnd(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: YearEndDto) {
    const ok = await this.setup.yearEndCheck(ctx, this.user(req), dto.yearEnd);
    await this.jobs.queueYearEnd(ok.organizationId, dto.yearEnd, ok.userId);
    return { queued: true };
  }
}
