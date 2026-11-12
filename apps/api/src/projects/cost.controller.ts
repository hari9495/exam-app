import { BadRequestException, Controller, Get, Param, ParseUUIDPipe, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import type { ScopeUser } from '../access/scope';
import { ProjectCostService } from './project-cost.service';

// Projects P-5 (PRJ-04, answers 1412, 1413, 1419): project cost (totals only) and project expenses. The service checks
// Projects finance and the project's manager. Registered before ProjectsController (its :id route).
@Controller('projects')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CostController {
  constructor(private readonly cost: ProjectCostService) {}

  @Get('costs')
  month(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query('month') month?: string) {
    if (month && !/^\d{4}-\d{2}$/.test(month)) throw new BadRequestException('Give the month as YYYY-MM.');
    return this.cost.month(ctx, req.user as ScopeUser, month);
  }

  @Get(':id/cost')
  project(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.cost.project(ctx, req.user as ScopeUser, id);
  }

  @Get(':id/expenses')
  expenses(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.cost.expenses(ctx, req.user as ScopeUser, id);
  }
}
