import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { RequireStepUp } from '../auth/step-up.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import type { ScopeUser } from '../access/scope';
import { AnswerDto, ConfirmBaseDto, DismissDto, FnfPatchDto, FnfPayeesDto, OffcycleItemDto, OverpaymentDto, OverpaymentListDto, WorksheetApproveDto, WorksheetCreateDto, WriteOffDto } from './dto-5g';
import { ArrearsService } from './arrears.service';
import { FnfService } from './fnf.service';

// Payroll batch 5g (M03-BUILD-DESIGN §14.7). Every route declares its key (YX-SEC-01); the services check the legal
// entities again and the database pay guard is the second layer. ⚡ = a fresh second sign-in step (P12).
//   payroll.offcycle.prepare   off-cycle runs (POST /payroll/runs with offcycleKind) and their items
//   payroll.arrears.approve    arrears worksheets, base confirmation, rule-change proposals, overpayment recoveries
//   payroll.fnf.manage         F&F settlements: lines, held lines, the second run; payees' bank accounts ⚡
//   payroll.writeoff.approve ⚡ write off the rest of an overpayment (never one's own)
//   (no key)                   an employee's own recovery plans and their answer
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class Payroll5gController {
  constructor(
    private readonly arrears: ArrearsService,
    private readonly fnf: FnfService,
  ) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  // ------------------------------------------------------------------------------------------ off-cycle items

  @Post('payroll/runs/:id/items')
  @RequirePermissions('payroll.offcycle.prepare')
  addItem(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: OffcycleItemDto) {
    return this.arrears.addItem(ctx, this.user(req), id, dto);
  }

  @Post('payroll/runs/:id/items/:itemId/remove')
  @HttpCode(200)
  @RequirePermissions('payroll.offcycle.prepare')
  removeItem(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.arrears.removeItem(ctx, this.user(req), id, itemId);
  }

  // ------------------------------------------------------------------------------------------ arrears worksheets

  @Get('payroll/arrears-worksheets')
  @RequirePermissions('payroll.arrears.approve')
  worksheets(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.arrears.worksheets(ctx, this.user(req));
  }

  @Post('payroll/arrears-worksheets')
  @RequirePermissions('payroll.arrears.approve')
  createWorksheet(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: WorksheetCreateDto) {
    return this.arrears.createWorksheet(ctx, this.user(req), dto);
  }

  @Get('payroll/arrears-worksheets/:id')
  @RequirePermissions('payroll.arrears.approve')
  worksheet(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.arrears.worksheet(ctx, this.user(req), id);
  }

  @Post('payroll/arrears-worksheets/:id/confirm-base')
  @HttpCode(200)
  @RequirePermissions('payroll.arrears.approve')
  confirmBase(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmBaseDto) {
    return this.arrears.confirmBase(ctx, this.user(req), id, dto);
  }

  @Post('payroll/arrears-worksheets/:id/approve')
  @HttpCode(200)
  @RequirePermissions('payroll.arrears.approve')
  approveWorksheet(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: WorksheetApproveDto) {
    return this.arrears.approveWorksheet(ctx, this.user(req), id, dto);
  }

  @Post('payroll/arrears-worksheets/:id/cancel')
  @HttpCode(200)
  @RequirePermissions('payroll.arrears.approve')
  cancelWorksheet(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.arrears.cancelWorksheet(ctx, this.user(req), id);
  }

  // ------------------------------------------------------------------------------------------ rule-change proposals

  @Get('statutory/arrears-proposals')
  @RequirePermissions('payroll.arrears.approve')
  proposals(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.arrears.proposals(ctx, this.user(req));
  }

  @Post('statutory/arrears-proposals/:id/accept')
  @HttpCode(200)
  @RequirePermissions('payroll.arrears.approve')
  accept(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.arrears.accept(ctx, this.user(req), id);
  }

  @Post('statutory/arrears-proposals/:id/dismiss')
  @HttpCode(200)
  @RequirePermissions('payroll.arrears.approve')
  dismiss(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DismissDto) {
    return this.arrears.dismiss(ctx, this.user(req), id, dto.reason);
  }

  // ------------------------------------------------------------------------------------------ F&F

  @Get('payroll/fnf')
  @RequirePermissions('payroll.fnf.manage')
  fnfList(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.fnf.list(ctx, this.user(req));
  }

  @Get('payroll/fnf/:id')
  @RequirePermissions('payroll.fnf.manage')
  fnfGet(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.fnf.get(ctx, this.user(req), id);
  }

  @Patch('payroll/fnf/:id')
  @RequirePermissions('payroll.fnf.manage')
  fnfPatch(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: FnfPatchDto) {
    return this.fnf.patch(ctx, this.user(req), id, dto);
  }

  @Post('payroll/fnf/:id/payees')
  @HttpCode(200)
  @RequirePermissions('payroll.fnf.manage')
  @RequireStepUp()
  fnfPayees(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: FnfPayeesDto) {
    return this.fnf.payees(ctx, this.user(req), id, dto);
  }

  @Post('payroll/fnf/:id/second-run')
  @RequirePermissions('payroll.fnf.manage')
  secondRun(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.fnf.secondRun(ctx, this.user(req), id);
  }

  // ------------------------------------------------------------------------------------------ overpayments

  @Get('payroll/overpayments')
  @RequireAnyPermission('payroll.arrears.approve', 'payroll.writeoff.approve')
  recoveries(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: OverpaymentListDto) {
    return this.arrears.recoveries(ctx, this.user(req), q.crossYear === 'true');
  }

  @Post('payroll/overpayments')
  @RequirePermissions('payroll.arrears.approve')
  createRecovery(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: OverpaymentDto) {
    return this.arrears.createRecovery(ctx, this.user(req), dto);
  }

  @Post('payroll/overpayments/:id/write-off')
  @HttpCode(200)
  @RequirePermissions('payroll.writeoff.approve')
  @RequireStepUp()
  writeOff(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: WriteOffDto) {
    return this.arrears.writeOff(ctx, this.user(req), id, dto.reason);
  }

  /** Your own recovery plans (no key). */
  @Get('payroll/me/overpayments')
  mine(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.arrears.mine(ctx, this.user(req));
  }

  @Post('payroll/me/overpayments/:id/answer')
  @HttpCode(200)
  answer(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AnswerDto) {
    return this.arrears.answer(ctx, this.user(req), id, dto.agree);
  }
}
