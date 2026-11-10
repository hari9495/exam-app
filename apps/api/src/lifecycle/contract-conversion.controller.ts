import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import type { ScopeUser } from '../access/scope';
import { ContractConversionDto } from './dto';
import { ContractConversionService } from './contract-conversion.service';

// CL-7 (CLB-05, answer 637): convert a contract worker to an employee through the joiner flow (onboarding key).
@Controller('lifecycle/joiners/from-contract-worker')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('lifecycle.onboarding.manage')
export class ContractConversionController {
  constructor(private readonly conversion: ContractConversionService) {}

  @Get(':deploymentId')
  prefill(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('deploymentId', ParseUUIDPipe) id: string) {
    return this.conversion.prefill(ctx, req.user as ScopeUser, id);
  }

  @Post(':deploymentId')
  start(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('deploymentId', ParseUUIDPipe) id: string, @Body() dto: ContractConversionDto) {
    return this.conversion.start(ctx, req.user as ScopeUser, id, dto);
  }
}
