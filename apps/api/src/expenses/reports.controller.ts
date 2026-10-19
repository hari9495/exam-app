import { BadRequestException, Controller, Get, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, Matches, IsUUID } from 'class-validator';
import { Request, Response } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import type { ScopeUser } from '../access/scope';
import { ExpenseReportsService, REPORTS, toCsv, type ReportKind } from './reports.service';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export class ReportQueryDto {
  @IsOptional()
  @Matches(ISO)
  from?: string;

  @IsOptional()
  @Matches(ISO)
  to?: string;

  @IsOptional()
  @IsIn(['json', 'csv'])
  format?: 'json' | 'csv';

  /** The company chosen in the top bar (design audit step 2); personal views ignore it. */
  @IsOptional()
  @IsUUID()
  legalEntityId?: string;
}

// Expenses batch E5: reports (EXP-09), JSON for the screen and CSV to export (M05-BUILD-DESIGN §18 "Reports").
@Controller('expenses')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ExpenseReportsController {
  constructor(private readonly reports: ExpenseReportsService) {}

  @Get('reports/:kind')
  @RequirePermissions('expense.report.view')
  async report(@Req() req: Request, @Res({ passthrough: true }) res: Response, @CurrentTenant() ctx: TenantContext, @Param('kind') kind: string, @Query() q: ReportQueryDto) {
    if (!(REPORTS as readonly string[]).includes(kind)) throw new BadRequestException('No such report.');
    if (q.from && q.to && q.from > q.to) throw new BadRequestException('The report starts after it ends.');
    const r = await this.reports.report(ctx, req.user as ScopeUser, kind as ReportKind, q.from, q.to, q.legalEntityId);
    if (q.format !== 'csv') return r;
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="expenses-${kind}-${r.from}-to-${r.to}.csv"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    return toCsv(r);
  }
}
