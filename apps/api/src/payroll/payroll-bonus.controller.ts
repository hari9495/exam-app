import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import type { ScopeUser } from '../access/scope';
import { BonusService } from './bonus.service';
import { BonusCreateDto, BonusPatchDto, BonusReturnDto, BonusRowDto, BonusSendDto, BonusVersionDto } from './dto-bonus';

// PAY-24 statutory bonus. Every route declares its key (YX-SEC-01); the service checks the legal entity again and the
// database pay guard is the second layer.
//   payroll.bonus.manage    work it out, enter the surplus and deductions, send it for approval, send it to a run
//   payroll.bonus.approve   approve or send back (never one's own: maker ≠ checker)
@Controller('payroll/bonus')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PayrollBonusController {
  constructor(private readonly bonus: BonusService) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  @Get()
  @RequireAnyPermission('payroll.bonus.manage', 'payroll.bonus.approve')
  overview(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query('legalEntityId', ParseUUIDPipe) legalEntityId: string, @Query('yearStart') yearStart?: string) {
    return this.bonus.overview(ctx, this.user(req), legalEntityId, yearStart || undefined);
  }

  @Get('entities')
  @RequireAnyPermission('payroll.bonus.manage', 'payroll.bonus.approve')
  entities(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.bonus.entities(ctx, this.user(req));
  }

  @Get(':id')
  @RequireAnyPermission('payroll.bonus.manage', 'payroll.bonus.approve')
  get(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.bonus.get(ctx, this.user(req), id);
  }

  @Post()
  @RequirePermissions('payroll.bonus.manage')
  create(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: BonusCreateDto) {
    return this.bonus.create(ctx, this.user(req), dto);
  }

  @Patch(':id')
  @RequirePermissions('payroll.bonus.manage')
  change(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BonusPatchDto) {
    return this.bonus.change(ctx, this.user(req), id, dto);
  }

  @Patch(':id/rows/:employmentId')
  @RequirePermissions('payroll.bonus.manage')
  changeRow(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('employmentId', ParseUUIDPipe) employmentId: string, @Body() dto: BonusRowDto) {
    return this.bonus.changeRow(ctx, this.user(req), id, employmentId, dto);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @RequirePermissions('payroll.bonus.manage')
  submit(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BonusVersionDto) {
    return this.bonus.submit(ctx, this.user(req), id, dto.version);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermissions('payroll.bonus.approve')
  approve(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BonusVersionDto) {
    return this.bonus.approve(ctx, this.user(req), id, dto.version);
  }

  @Post(':id/return')
  @HttpCode(200)
  @RequirePermissions('payroll.bonus.approve')
  sendBack(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BonusReturnDto) {
    return this.bonus.sendBack(ctx, this.user(req), id, dto);
  }

  @Post(':id/send')
  @HttpCode(200)
  @RequirePermissions('payroll.bonus.manage')
  send(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BonusSendDto) {
    return this.bonus.send(ctx, this.user(req), id, dto);
  }
}
