import { BadRequestException, Controller, Get, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';
import { Request, Response } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import type { ScopeUser } from '../access/scope';
import { file } from './payroll.controller';
import { PayReportsService, isPayReport } from './reports.service';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export class PayReportQueryDto {
  @IsOptional()
  @IsUUID()
  legalEntityId?: string;

  @IsOptional()
  @Matches(MONTH, { message: 'from must be a month like 2026-09' })
  from?: string;

  @IsOptional()
  @Matches(MONTH, { message: 'to must be a month like 2026-09' })
  to?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;

  @IsOptional()
  @IsIn(['json', 'csv'])
  format?: 'json' | 'csv';
}

// PAY-25 payroll reports, read only. One key (payroll.reports.view); the service narrows it to the legal entities it
// is granted for and opens the database pay guard to exactly those. CSV exports hold every row and are audited.
@Controller('payroll/reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PayrollReportsController {
  constructor(private readonly reports: PayReportsService) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  @Get()
  @RequirePermissions('payroll.reports.view')
  options(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.reports.options(ctx, this.user(req));
  }

  @Get(':kind')
  @RequirePermissions('payroll.reports.view')
  async report(@Req() req: Request, @Res({ passthrough: true }) res: Response, @CurrentTenant() ctx: TenantContext, @Param('kind') kind: string, @Query() q: PayReportQueryDto) {
    if (!isPayReport(kind)) throw new BadRequestException('There is no such payroll report.');
    const { page, pageSize, format, ...filters } = q;
    if (format === 'csv') return file(res, { ...(await this.reports.exportCsv(ctx, this.user(req), kind, filters)), contentType: 'text/csv; charset=utf-8' });
    return this.reports.report(ctx, this.user(req), kind, filters, { page: page ?? 1, pageSize: pageSize ?? 200 });
  }
}
