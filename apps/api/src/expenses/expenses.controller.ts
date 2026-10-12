import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import type { ScopeUser } from '../access/scope';
import { CategoryDto, EndDto, GstRegistrationDto, LimitsQueryDto, MileageRateDto, NewVersionDto, PerDiemRateDto, PolicyDto, TierDto } from './dto';
import { ExpenseSetupService } from './setup.service';

// Expenses batch E1 (M05-BUILD-DESIGN §18 "Setup", §16): company configuration under expense.policy.manage
// (company-wide); categories, tiers and "my limits" are read by everyone who claims (implicit grant).
@Controller('expenses')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ExpensesController {
  constructor(private readonly setup: ExpenseSetupService) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  @Get('setup-check')
  @RequirePermissions('expense.policy.manage')
  setupCheck(@CurrentTenant() ctx: TenantContext) {
    return this.setup.setupCheck(ctx);
  }

  @Post('setup/from-starter')
  @RequirePermissions('expense.policy.manage')
  fromStarter(@CurrentTenant() ctx: TenantContext) {
    return this.setup.fromStarter(ctx);
  }

  @Get('categories')
  categories(@CurrentTenant() ctx: TenantContext) {
    return this.setup.categories(ctx);
  }

  @Post('categories')
  @RequirePermissions('expense.policy.manage')
  createCategory(@CurrentTenant() ctx: TenantContext, @Body() dto: CategoryDto) {
    return this.setup.saveCategory(ctx, null, dto);
  }

  @Put('categories/:id')
  @RequirePermissions('expense.policy.manage')
  updateCategory(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CategoryDto) {
    return this.setup.saveCategory(ctx, id, dto);
  }

  @Get('tiers')
  tiers(@CurrentTenant() ctx: TenantContext) {
    return this.setup.tiers(ctx);
  }

  @Post('tiers')
  @RequirePermissions('expense.policy.manage')
  createTier(@CurrentTenant() ctx: TenantContext, @Body() dto: TierDto) {
    return this.setup.saveTier(ctx, null, dto);
  }

  @Put('tiers/:id')
  @RequirePermissions('expense.policy.manage')
  updateTier(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TierDto) {
    return this.setup.saveTier(ctx, id, dto);
  }

  @Get('policies')
  @RequirePermissions('expense.policy.manage')
  policies(@CurrentTenant() ctx: TenantContext) {
    return this.setup.policies(ctx);
  }

  @Post('policies')
  @RequirePermissions('expense.policy.manage')
  createPolicy(@CurrentTenant() ctx: TenantContext, @Body() dto: PolicyDto) {
    return this.setup.savePolicy(ctx, null, dto);
  }

  @Put('policies/:id')
  @RequirePermissions('expense.policy.manage')
  updatePolicy(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PolicyDto) {
    return this.setup.savePolicy(ctx, id, dto);
  }

  @Post('policies/:id/new-version')
  @RequirePermissions('expense.policy.manage')
  newVersion(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NewVersionDto) {
    return this.setup.newVersion(ctx, id, dto);
  }

  @Get('rates')
  @RequirePermissions('expense.policy.manage')
  rates(@CurrentTenant() ctx: TenantContext) {
    return this.setup.rates(ctx);
  }

  @Post('mileage-rates')
  @RequirePermissions('expense.policy.manage')
  addMileage(@CurrentTenant() ctx: TenantContext, @Body() dto: MileageRateDto) {
    return this.setup.addMileageRate(ctx, dto);
  }

  @Post('per-diem-rates')
  @RequirePermissions('expense.policy.manage')
  addPerDiem(@CurrentTenant() ctx: TenantContext, @Body() dto: PerDiemRateDto) {
    return this.setup.addPerDiemRate(ctx, dto);
  }

  @Get('gst-registrations')
  @RequirePermissions('expense.policy.manage')
  gst(@CurrentTenant() ctx: TenantContext) {
    return this.setup.gstRegistrations(ctx);
  }

  @Post('gst-registrations')
  @RequirePermissions('expense.policy.manage')
  addGst(@CurrentTenant() ctx: TenantContext, @Body() dto: GstRegistrationDto) {
    return this.setup.addGstRegistration(ctx, dto);
  }

  @Post('gst-registrations/:id/end')
  @RequirePermissions('expense.policy.manage')
  endGst(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EndDto) {
    return this.setup.endGstRegistration(ctx, id, dto.validTo);
  }

  @Get('me/limits')
  myLimits(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: LimitsQueryDto) {
    return this.setup.myLimits(ctx, this.user(req), q.on);
  }
}
