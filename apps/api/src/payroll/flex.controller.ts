import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import type { ScopeUser } from '../access/scope';
import { FlexComponentChangeDto, FlexComponentDto, FlexLedgerQueryDto, FlexSettleDto } from './dto-flex';
import { FlexBenefitsService } from './flex.service';

// B8/E5 flexible benefits (founder answers 2406, 2407):
//   benefits.settings.manage   Settings 4.11: the company's flexible components (the unclaimed rule is the company
//                              setting benefits.fbp.unclaimed, PUT org/settings with the same key)
//   payroll.input.manage       a person's ledger and the March or exit settlement, in the legal entities it reaches
//   (no key)                   the signed-in person's own ledger
@Controller('benefits/flex')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FlexBenefitsController {
  constructor(private readonly flex: FlexBenefitsService) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  @Get('settings')
  @RequirePermissions('benefits.settings.manage')
  settings(@CurrentTenant() ctx: TenantContext) {
    return this.flex.settings(ctx);
  }

  @Post('components')
  @RequirePermissions('benefits.settings.manage')
  addComponent(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: FlexComponentDto) {
    return this.flex.addComponent(ctx, this.user(req), dto);
  }

  @Put('components/:id')
  @RequirePermissions('benefits.settings.manage')
  changeComponent(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: FlexComponentChangeDto) {
    return this.flex.changeComponent(ctx, this.user(req), id, dto);
  }

  /** The signed-in person's own ledger for a tax year (the current one by default). */
  @Get('me')
  mine(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: FlexLedgerQueryDto) {
    return this.flex.myLedger(ctx, this.user(req), q.taxYear);
  }

  @Get('ledger/:employeeId')
  @RequirePermissions('payroll.input.manage')
  ledger(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('employeeId', ParseUUIDPipe) employeeId: string, @Query() q: FlexLedgerQueryDto) {
    return this.flex.ledger(ctx, this.user(req), employeeId, q.taxYear);
  }

  /** Answer 2455: the settlement screen's list for a tax year (the current one by default). */
  @Get('settlements')
  @RequirePermissions('payroll.input.manage')
  overview(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: FlexLedgerQueryDto) {
    return this.flex.overview(ctx, this.user(req), q.taxYear);
  }

  @Post('settlements')
  @RequirePermissions('payroll.input.manage')
  settle(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: FlexSettleDto) {
    return this.flex.settle(ctx, this.user(req), dto);
  }
}
