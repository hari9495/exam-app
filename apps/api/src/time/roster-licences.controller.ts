import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { MODERATE_UPLOAD_THROTTLE } from '../rate-limit-tiers';
import type { ScopeUser } from '../access/scope';
import { LicencesService } from './licences.service';
import { EmployeeLicenceDto, LicenceOverrideDto, LicenceRequirementDto, LicenceTypeDto, LicenceTypeUpdateDto, RenewAskDto } from './roster-ops.dto';

// TIM-40 licence requirements: company-wide Time set-up (leave.settings.manage held for the whole company, checked
// again in TimeSetupService.run); writes are refused while acting for someone else.
@Controller('time/licences')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('leave.settings.manage')
export class RosterLicencesController {
  constructor(private readonly licences: LicencesService) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  @Get()
  overview(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.licences.overview(ctx, this.user(req));
  }

  @Post('types')
  createType(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: LicenceTypeDto) {
    return this.licences.createType(ctx, this.user(req), dto);
  }

  @Put('types/:id')
  updateType(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LicenceTypeUpdateDto) {
    return this.licences.updateType(ctx, this.user(req), id, dto);
  }

  @Post('requirements')
  addRequirement(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: LicenceRequirementDto) {
    return this.licences.addRequirement(ctx, this.user(req), dto);
  }

  @Post('requirements/:id/remove')
  @HttpCode(200)
  removeRequirement(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.licences.removeRequirement(ctx, this.user(req), id);
  }

  @Post('holders')
  recordLicence(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: EmployeeLicenceDto) {
    return this.licences.recordLicence(ctx, this.user(req), dto);
  }

  @Post('overrides')
  override(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: LicenceOverrideDto) {
    return this.licences.override(ctx, this.user(req), dto);
  }

  @Post('renew-asks')
  @HttpCode(200)
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  askRenew(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: RenewAskDto) {
    return this.licences.askRenew(ctx, this.user(req), dto);
  }
}
