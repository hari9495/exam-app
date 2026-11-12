import { BadRequestException, Controller, Get, Param, ParseUUIDPipe, Query, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import type { ScopeUser } from '../access/scope';
import { ProjectCostService } from './project-cost.service';

// Projects P-5 (PRJ-04, answers 1412, 1413, 1419): project cost (totals only) and project expenses. The service checks
// Projects finance and the project's manager. Registered before ProjectsController (its :id route).
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

@Controller('projects')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CostController {
  constructor(private readonly cost: ProjectCostService) {}

  @Get('costs')
  month(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query('month') month?: string, @Query('quarter') quarter?: string) {
    // A real month only (2026-13 would otherwise reach the database as an invalid date); P-6 (1622): or a quarter.
    if (month && !MONTH.test(month)) throw new BadRequestException('Give the month as YYYY-MM.');
    if (quarter && !/^\d{4}-Q[1-4]$/.test(quarter)) throw new BadRequestException('Give the quarter as YYYY-Q1 to YYYY-Q4.');
    return this.cost.month(ctx, req.user as ScopeUser, month, quarter);
  }

  /** Answer 1622: the project cost journal (CSV) for the accounting system. */
  @Get('costs/journal')
  async journal(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query('month') month: string | undefined, @Res({ passthrough: true }) res: Response) {
    if (!month || !MONTH.test(month)) throw new BadRequestException('Give the month as YYYY-MM.');
    const f = await this.cost.journal(ctx, req.user as ScopeUser, month);
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${f.filename}"` });
    return new StreamableFile(f.buffer);
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
