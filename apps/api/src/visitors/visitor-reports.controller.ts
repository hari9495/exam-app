import { Controller, Get, Param, ParseUUIDPipe, Query, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { TenantContext } from '@exam-platform/shared';
import type { ScopeUser } from '../access/scope';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { VisitorReportsService } from './visitor-reports.service';

const who = (req: Request) => req.user as ScopeUser;
const day = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);
const pdf = (res: Response, file: Buffer, name: string) => {
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${name}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  return new StreamableFile(file);
};

// Visitors slice 4: the badge PDF (607), reports from counts (608), the emergency roll-call (612). The service checks
// the location reach; nothing here changes data, so acting for someone else may read and print.
@Controller('visitors')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class VisitorReportsController {
  constructor(private readonly reports: VisitorReportsService) {}

  @Get('reports')
  @RequireAnyPermission('visitors.log.view', 'visitors.desk.manage')
  report(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query('from') from?: string, @Query('to') to?: string, @Query('locationId') locationId?: string) {
    return this.reports.reports(ctx, who(req), { from: day(from), to: day(to), locationId: locationId || undefined });
  }

  @Get('rollcall')
  @RequireAnyPermission('visitors.rollcall.view', 'visitors.desk.manage')
  rollCall(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query('locationId', new ParseUUIDPipe({ optional: true })) locationId?: string) {
    return this.reports.rollCall(ctx, who(req), locationId);
  }

  @Get('rollcall.pdf')
  @RequireAnyPermission('visitors.rollcall.view', 'visitors.desk.manage')
  async rollCallPdf(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query('locationId', ParseUUIDPipe) locationId: string, @Res({ passthrough: true }) res: Response) {
    return pdf(res, await this.reports.rollCallPdf(ctx, who(req), locationId), 'roll-call.pdf');
  }

  @Get(':id/badge.pdf')
  @RequireAnyPermission('visitors.desk.manage')
  async badge(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    return pdf(res, await this.reports.badge(ctx, who(req), id), 'visitor-badge.pdf');
  }
}
