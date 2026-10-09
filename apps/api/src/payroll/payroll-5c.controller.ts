import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { RequireStepUp } from '../auth/step-up.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import type { ScopeUser } from '../access/scope';
import { AckDto, CostRateListDto, CourtOrderDto, HoldDto, JournalExportDto, LoanChangeDto, LoanRequestDto, LopInputsDto, OneTimeDto, OneTimeListDto, ReasonDto, RunCreateDto, RunDecisionDto, RunListDto, SpecialDaysDto, SubmitRunDto } from './dto-5c';
import { PayInputsService } from './inputs.service';
import { PayRunsService } from './runs.service';

// Payroll batch 5c (M03-BUILD-DESIGN §14.3). Every route declares its key (YX-SEC-01); the services check its legal
// entities again and the database pay guard is the second layer. ⚡ = a fresh second sign-in step (P12).
//   payroll.run.view               runs, progress, payslips with explanations, variances, reproduce
//   payroll.run.prepare            create, readiness and waivers, calculate, acknowledge variances, submit, void
//   payroll.run.approve ⚡          approve or reject on the run's page (P03 decide, maker ≠ checker, typed phrase)
//   payroll.input.manage           manual LOP, one-time pay, special days, court orders
//   payroll.hold.manage            holds and releases
//   payroll.loan.manage            loans for others and schedule changes (a request for yourself needs no key)
//   payroll.journal.export / payroll.cost_rate.view
const RUN_VIEW = ['payroll.run.view', 'payroll.run.prepare', 'payroll.run.approve'] as const;

@Controller('payroll')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class Payroll5cController {
  constructor(
    private readonly runs: PayRunsService,
    private readonly inputs: PayInputsService,
  ) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  // ------------------------------------------------------------------------------------------ runs

  @Post('runs')
  @RequirePermissions('payroll.run.prepare')
  create(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: RunCreateDto) {
    return this.runs.create(ctx, this.user(req), dto.payGroupId, dto.month);
  }

  @Get('runs')
  @RequireAnyPermission(...RUN_VIEW)
  list(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: RunListDto) {
    return this.runs.list(ctx, this.user(req), q.month);
  }

  @Get('runs/:id')
  @RequireAnyPermission(...RUN_VIEW)
  get(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.runs.get(ctx, this.user(req), id);
  }

  @Get('runs/:id/readiness')
  @RequirePermissions('payroll.run.prepare')
  readiness(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.runs.readiness(ctx, this.user(req), id);
  }

  @Post('runs/:id/validations/:vid/waive')
  @HttpCode(200)
  @RequirePermissions('payroll.run.prepare')
  waive(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('vid', ParseUUIDPipe) vid: string, @Body() dto: ReasonDto) {
    return this.runs.waive(ctx, this.user(req), id, vid, dto.reason);
  }

  @Post('runs/:id/calculate')
  @HttpCode(202)
  @RequirePermissions('payroll.run.prepare')
  calculate(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.runs.calculate(ctx, this.user(req), id);
  }

  @Get('runs/:id/progress')
  @RequireAnyPermission(...RUN_VIEW)
  progress(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.runs.progress(ctx, this.user(req), id);
  }

  @Get('runs/:id/payslips')
  @RequireAnyPermission(...RUN_VIEW)
  payslips(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.runs.payslips(ctx, this.user(req), id);
  }

  /** Payroll staff of the entity; the person themselves once published (checked in the service). */
  @Get('payslips/:id')
  payslip(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.runs.payslip(ctx, this.user(req), id);
  }

  @Post('payslips/:id/reproduce')
  @HttpCode(200)
  @RequirePermissions('payroll.run.view')
  reproduce(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.runs.reproduce(ctx, this.user(req), id);
  }

  @Get('runs/:id/variances')
  @RequireAnyPermission(...RUN_VIEW)
  variances(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.runs.varianceList(ctx, this.user(req), id);
  }

  @Post('runs/:id/variances/:vid/ack')
  @HttpCode(200)
  @RequirePermissions('payroll.run.prepare')
  ack(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('vid', ParseUUIDPipe) vid: string, @Body() dto: AckDto) {
    return this.runs.acknowledge(ctx, this.user(req), id, vid, dto.note);
  }

  @Post('runs/:id/submit')
  @HttpCode(200)
  @RequirePermissions('payroll.run.prepare')
  submit(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SubmitRunDto) {
    return this.runs.submit(ctx, this.user(req), id, dto.selfApprovalReason);
  }

  @Post('runs/:id/decision')
  @HttpCode(200)
  @RequirePermissions('payroll.run.approve')
  @RequireStepUp()
  decide(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RunDecisionDto) {
    return this.runs.decide(ctx, this.user(req), id, dto.decision, dto.reason ?? null, dto.confirmation);
  }

  @Post('runs/:id/void')
  @HttpCode(200)
  @RequirePermissions('payroll.run.prepare')
  void(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.runs.void(ctx, this.user(req), id, dto.reason);
  }

  // ------------------------------------------------------------------------------------------ inputs

  @Get('lop-inputs/:month')
  @RequirePermissions('payroll.input.manage')
  lop(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('month') month: string) {
    return this.inputs.lop(ctx, this.user(req), parseMonth(month));
  }

  @Put('lop-inputs/:month')
  @RequirePermissions('payroll.input.manage')
  saveLop(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('month') month: string, @Body() dto: LopInputsDto) {
    return this.inputs.saveLop(ctx, this.user(req), parseMonth(month), dto.rows, dto.source);
  }

  @Get('one-time-pays')
  @RequirePermissions('payroll.input.manage')
  oneTime(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: OneTimeListDto) {
    return this.inputs.oneTimeList(ctx, this.user(req), q.month);
  }

  @Post('one-time-pays')
  @RequirePermissions('payroll.input.manage')
  addOneTime(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: OneTimeDto) {
    return this.inputs.addOneTime(ctx, this.user(req), dto);
  }

  @Patch('one-time-pays/:id/cancel')
  @RequirePermissions('payroll.input.manage')
  cancelOneTime(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.inputs.cancelOneTime(ctx, this.user(req), id);
  }

  @Put('special-days')
  @RequirePermissions('payroll.input.manage')
  specialDays(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: SpecialDaysDto) {
    return this.inputs.saveSpecialDays(ctx, this.user(req), dto);
  }

  @Get('holds')
  @RequirePermissions('payroll.hold.manage')
  holds(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.inputs.holds(ctx, this.user(req));
  }

  @Post('holds')
  @RequirePermissions('payroll.hold.manage')
  addHold(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: HoldDto) {
    return this.inputs.addHold(ctx, this.user(req), dto);
  }

  @Post('holds/:id/release')
  @HttpCode(200)
  @RequirePermissions('payroll.hold.manage')
  releaseHold(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.inputs.releaseHold(ctx, this.user(req), id);
  }

  /** Your own requests and, with payroll.loan.manage, the loans of the entities in scope. */
  @Get('loans')
  loans(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.inputs.loans(ctx, this.user(req));
  }

  /** For yourself (no key); for someone else the service requires payroll.loan.manage over them. */
  @Post('loans')
  requestLoan(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: LoanRequestDto) {
    return this.inputs.requestLoan(ctx, this.user(req), dto);
  }

  @Post('loans/:id/schedule-changes')
  @RequirePermissions('payroll.loan.manage')
  changeLoan(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LoanChangeDto) {
    return this.inputs.changeLoan(ctx, this.user(req), id, dto);
  }

  @Get('court-orders')
  @RequirePermissions('payroll.input.manage')
  courtOrders(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.inputs.courtOrders(ctx, this.user(req));
  }

  @Post('court-orders')
  @RequirePermissions('payroll.input.manage')
  addCourtOrder(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: CourtOrderDto) {
    return this.inputs.addCourtOrder(ctx, this.user(req), dto);
  }

  // ------------------------------------------------------------------------------------------ journal and cost rates

  @Get('runs/:id/journal')
  @RequirePermissions('payroll.journal.export')
  journal(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.inputs.journal(ctx, this.user(req), id);
  }

  @Post('runs/:id/journal/export')
  @HttpCode(200)
  @RequirePermissions('payroll.journal.export')
  async exportJournal(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: JournalExportDto, @Res({ passthrough: true }) res: Response) {
    const out = await this.inputs.exportJournal(ctx, this.user(req), id, dto.format);
    res.set({ 'Content-Type': out.contentType, 'Content-Disposition': `attachment; filename="${out.name}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    return new StreamableFile(out.file);
  }

  @Get('cost-rates')
  @RequirePermissions('payroll.cost_rate.view')
  costRates(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: CostRateListDto) {
    return this.inputs.costRates(ctx, this.user(req), q.month);
  }
}

const parseMonth = (m: string) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) throw new BadRequestException('The month is like 2026-10.');
  return m;
};
